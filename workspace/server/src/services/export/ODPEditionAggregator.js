import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    odpEditionStore
} from '../../store/index.js';
import {DraftingGroupKeys, getDraftingGroupDisplay, MilestoneEventOrder} from "../../../../shared/src/index.js";
import baseline from "../../routes/baseline.js";
import DeltaToAsciidocConverter from './DeltaToAsciidocConverter.js';

/**
 * ODPEditionAggregator handles complex data assembly for ODP Edition exports.
 * Aggregates data from multiple services and builds the complete data structure
 * needed for AsciiDoc rendering.
 */
export class ODPEditionAggregator {

    constructor() {
        this.deltaConverter = new DeltaToAsciidocConverter();
    }

    /**
     * Get all images extracted during the last export data build
     * @returns {Array<{filename: string, data: string, mediaType: string}>}
     */
    getExtractedImages() {
        return this.deltaConverter.getExtractedImages();
    }

    /**
     * Convert rich text fields from Delta JSON to AsciiDoc
     * @param {Object} entity - Entity with rich text fields
     * @param {Array<string>} fieldNames - Names of fields to convert
     * @returns {Object} Entity with converted fields
     * @private
     */
    _convertRichTextFields(entity, fieldNames) {
        const converted = { ...entity };

        for (const fieldName of fieldNames) {
            if (converted[fieldName]) {
                try {
                    converted[fieldName] = this.deltaConverter.deltaToAsciidoc(converted[fieldName]);
                } catch (error) {
                    // If conversion fails, leave field as-is or set to empty
                    console.warn(`Failed to convert ${fieldName} for entity ${entity.itemId || entity.id}: ${error.message}`);
                    converted[fieldName] = '';
                }
            }
        }

        return converted;
    }

    /**
     * Check if wave A is chronologically before wave B
     * @private
     */
    _isWaveBefore(waveA, waveB) {
        if (waveA.year < waveB.year) return true;
        if (waveA.year > waveB.year) return false;

        // Same year - compare quarters (treat undefined as 0)
        const quarterA = waveA.quarter ?? 0;
        const quarterB = waveB.quarter ?? 0;
        return quarterA < quarterB;
    }

    /**
     * Group items by their DRG (Drafting Group) field
     */
    _groupByDRG(items) {
        const drgOrder = DraftingGroupKeys;
        const groups = {};

        // Initialize groups in order
        drgOrder.forEach(drg => {
            groups[getDraftingGroupDisplay(drg)] = [];
        });
        groups['UNASSIGNED'] = [];

        // Distribute items to groups
        items.forEach(item => {
            const drg = item.drg || 'UNASSIGNED';
            if (groups[getDraftingGroupDisplay(drg)]) {
                groups[getDraftingGroupDisplay(drg)].push(item);
            } else {
                groups['UNASSIGNED'].push(item);
            }
        });

        // Convert to array format for Mustache
        return Object.entries(groups)
            .filter(([_, items]) => items.length > 0)
            .map(([drg, items]) => ({
                drg,
                items
            }));
    }

    async _buildExportData(waves, changes, requirements, title, userId, startingWave = null) {
        // Enrich operational changes with their milestones (this also converts rich text fields)
        const enrichedChanges = await this._enrichChangesWithMilestones(changes, userId, startingWave);

        // Enrich waves with milestones grouped by wave (uses already-converted change data)
        const enrichedWaves = await this._enrichWavesWithMilestones(waves, enrichedChanges, userId);

        // Build reverse lookup: requirement -> satisfying change
        const reqToChangeMap = new Map();

        changes.forEach(change => {
            if (change.satisfiesRequirements) {
                change.satisfiesRequirements.forEach(reqRef => {
                    reqToChangeMap.set(reqRef.id, {
                        id: change.itemId,
                        title: change.title
                    });
                });
            }
        });

        // Build reverse lookup: ON -> implementing ORs
        const onToORsMap = new Map();

        requirements
            .filter(req => req.type === 'ON')
            .forEach(on => onToORsMap.set(on.itemId, []));

        requirements
            .filter(req => req.type === 'OR')
            .forEach(or => {
                if (or.implementedONs) {
                    or.implementedONs.forEach(onRef => {
                        if (onToORsMap.has(onRef.id)) {
                            onToORsMap.get(onRef.id).push({
                                id: or.itemId,
                                title: or.title
                            });
                        }
                    });
                }
            });

        // Process requirements with relationships
        const processedORs = requirements
            .filter(req => req.type === 'OR')
            .map(or => {
                // Convert rich text fields to AsciiDoc
                const converted = this._convertRichTextFields(or, ['statement', 'rationale', 'flows', 'privateNotes']);
                return {
                    ...converted,
                    satisfiedByChange: reqToChangeMap.get(or.itemId) || null
                };
            });

        const processedONs = requirements
            .filter(req => req.type === 'ON')
            .map(on => {
                // Convert rich text fields to AsciiDoc
                const converted = this._convertRichTextFields(on, ['statement', 'rationale', 'flows', 'privateNotes']);
                return {
                    ...converted,
                    implementingORs: onToORsMap.get(on.itemId) || [],
                    satisfiedByChange: reqToChangeMap.get(on.itemId) || null
                };
            });

        return {
            title: title,
            waves: enrichedWaves,
            operationalChanges: this._groupByDRG(enrichedChanges),
            operationalRequirements: this._groupByDRG(processedORs),
            operationalNeeds: this._groupByDRG(processedONs)
        };
    }

    async buildEditionExportData(editionId, userId) {
        // Reset image tracking for this export
        this.deltaConverter.resetImageTracking();

        // Get the edition first
        let edition;
        const tx = createTransaction(userId);
        try {
            edition = await odpEditionStore().findById(editionId, tx);
            await commitTransaction(tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }

        if (!edition) {
            throw new Error(`ODP Edition with ID ${editionId} not found`);
        }

        // Import services
        const { default: waveService } = await import('../WaveService.js');
        const { default: operationalChangeService } = await import('../OperationalChangeService.js');
        const { default: operationalRequirementService } = await import('../OperationalRequirementService.js');

        // Get all waves
        const allWaves = await waveService.listItems(userId);

        // Find the starting wave
        const startingWave = allWaves.find(w => w.id === edition.startsFromWave.id);
        if (!startingWave) {
            throw new Error(`Starting wave with ID ${edition.startsFromWave.id} not found`);
        }

        // Filter waves chronologically
        const editionWaves = allWaves.filter(w => {
            if (w.year > startingWave.year) return true;
            if (w.year === startingWave.year) {
                // If starting wave has no quarter, include all waves from that year
                if (startingWave.quarter === null || startingWave.quarter === undefined) return true;
                // If starting wave has quarter, compare quarters (treat undefined as 0)
                const wQuarter = w.quarter ?? 0;
                const startQuarter = startingWave.quarter ?? 0;
                return wQuarter >= startQuarter;
            }
            return false;
        });

        // Get all operational changes and requirements
        const editionChanges = await operationalChangeService.getAll(userId, edition.baseline.id, edition.startsFromWave.id);
        const editionRequirements = await operationalRequirementService.getAll(userId, edition.baseline.id, edition.startsFromWave.id);

        return this._buildExportData(editionWaves, editionChanges, editionRequirements, `ODP Edition ${edition.title}`, userId, startingWave);
    }

    async buildRepositoryExportData(userId) {
        // Reset image tracking for this export
        this.deltaConverter.resetImageTracking();

        // Import services
        const { default: waveService } = await import('../WaveService.js');
        const { default: operationalChangeService } = await import('../OperationalChangeService.js');
        const { default: operationalRequirementService } = await import('../OperationalRequirementService.js');

        // Get ALL data
        const allWaves = await waveService.listItems(userId);
        const allChanges = await operationalChangeService.getAll(userId);
        const allRequirements = await operationalRequirementService.getAll(userId);

        return this._buildExportData(allWaves, allChanges, allRequirements, 'ODP Repository', userId, null);
    }

    /**
     * Enrich waves with their associated milestones
     * Groups milestones by wave and includes operational change reference
     */
    async _enrichWavesWithMilestones(waves, operationalChanges, userId) {
        const { default: operationalChangeService } = await import('../OperationalChangeService.js');
        const { idsEqual } = await import('../../../../shared/src/model/utils.js');

        // Define the event type order you want
        const eventTypeOrder = MilestoneEventOrder;

        for (const wave of waves) {
            // Initialize groups for each event type
            wave.milestonesByEventType = {};
            eventTypeOrder.forEach(type => {
                wave.milestonesByEventType[type] = [];
            });

            // Collect all milestones for this wave
            for (const change of operationalChanges) {
                const milestones = await operationalChangeService.getMilestones(change.itemId, userId);

                // Find milestones for THIS specific wave
                const waveMilestones = milestones.filter(m => {
                    return m.wave && idsEqual(m.wave.id, wave.id);
                });

                // Group each milestone by its event types
                waveMilestones.forEach(milestone => {
                    // Convert milestone description to AsciiDoc
                    let description = milestone.description;
                    if (description) {
                        try {
                            description = this.deltaConverter.deltaToAsciidoc(description);
                        } catch (error) {
                            console.warn(`Failed to convert description for milestone ${milestone.id}: ${error.message}`);
                            description = '';
                        }
                    }

                    const enrichedMilestone = {
                        ...milestone,
                        description: description,
                        operationalChange: {
                            id: change.itemId,
                            drg: change.drg,
                            title: change.title,
                            purpose: change.purpose
                        }
                    };

                    // Add to appropriate event type groups
                    if (milestone.eventTypes && milestone.eventTypes.length > 0) {
                        milestone.eventTypes.forEach(eventType => {
                            if (wave.milestonesByEventType[eventType]) {
                                wave.milestonesByEventType[eventType].push(enrichedMilestone);
                            } else {
                                // Handle unknown event types
                                if (!wave.milestonesByEventType['OTHER']) {
                                    wave.milestonesByEventType['OTHER'] = [];
                                }
                                wave.milestonesByEventType['OTHER'].push(enrichedMilestone);
                            }
                        });
                    } else {
                        // No event types specified - put in OTHER
                        wave.milestonesByEventType['OTHER'].push(enrichedMilestone);
                    }
                });
            }

            // Convert to array format for Mustache template
            wave.eventTypeGroups = eventTypeOrder
                .map(type => ({
                    eventType: type,
                    eventTypeLabel: type.replace(/_/g, ' '),
                    milestones: wave.milestonesByEventType[type]
                }))
                .filter(group => group.milestones.length > 0); // Only include groups with milestones
        }

        return waves;
    }

    /**
     * Enrich operational changes with their milestones
     */
    async _enrichChangesWithMilestones(operationalChanges, userId, startingWave = null) {
        const { default: operationalChangeService } = await import('../OperationalChangeService.js');

        for (const change of operationalChanges) {
            // Convert rich text fields to AsciiDoc
            const richTextFields = ['purpose', 'initialState', 'finalState', 'details', 'privateNotes'];
            for (const fieldName of richTextFields) {
                if (change[fieldName]) {
                    try {
                        change[fieldName] = this.deltaConverter.deltaToAsciidoc(change[fieldName]);
                    } catch (error) {
                        console.warn(`Failed to convert ${fieldName} for change ${change.itemId}: ${error.message}`);
                        change[fieldName] = '';
                    }
                }
            }

            const milestones = await operationalChangeService.getMilestones(change.itemId, userId);

            // Sort milestones chronologically by wave year and quarter
            change.milestones = milestones.sort((a, b) => {
                // Handle milestones without waves
                if (!a.wave && !b.wave) return 0;
                if (!a.wave) return 1;  // Put waveless milestones at the end
                if (!b.wave) return -1;

                // Compare by year first
                if (a.wave.year !== b.wave.year) {
                    return a.wave.year - b.wave.year;
                }

                // Then by quarter if same year
                return a.wave.quarter - b.wave.quarter;
            });

            // Convert milestone descriptions to AsciiDoc and mark if before edition start
            change.milestones.forEach(milestone => {
                if (milestone.description) {
                    try {
                        milestone.description = this.deltaConverter.deltaToAsciidoc(milestone.description);
                    } catch (error) {
                        console.warn(`Failed to convert description for milestone ${milestone.id}: ${error.message}`);
                        milestone.description = '';
                    }
                }

                // Mark milestone if its wave is before edition starting wave
                if (startingWave && milestone.wave) {
                    milestone.isBeforeEditionStart = this._isWaveBefore(milestone.wave, startingWave);
                } else {
                    milestone.isBeforeEditionStart = false;
                }
            });
        }

        return operationalChanges;
    }
}

export default ODPEditionAggregator;