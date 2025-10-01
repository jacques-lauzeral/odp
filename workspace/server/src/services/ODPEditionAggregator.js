import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    odpEditionStore
} from '../store/index.js';

/**
 * ODPEditionAggregator handles complex data assembly for ODP Edition exports.
 * Aggregates data from multiple services and builds the complete data structure
 * needed for AsciiDoc rendering.
 */
export class ODPEditionAggregator {

    async buildEditionExportData(editionId, userId) {
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
        const { default: waveService } = await import('./WaveService.js');
        const { default: operationalChangeService } = await import('./OperationalChangeService.js');
        const { default: operationalRequirementService } = await import('./OperationalRequirementService.js');

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
            if (w.year === startingWave.year && w.quarter >= startingWave.quarter) return true;
            return false;
        });

        // Get all operational changes and requirements
        const allChanges = await operationalChangeService.getAll(userId);
        const allRequirements = await operationalRequirementService.getAll(userId);

        // Enrich waves with milestones grouped by wave
        const enrichedWaves = await this._enrichWavesWithMilestones(editionWaves, allChanges, userId);

        // Enrich operational changes with their milestones
        const enrichedChanges = await this._enrichChangesWithMilestones(allChanges, userId);

        // Build reverse lookup: requirement -> satisfying change
        const reqToChangeMap = new Map();

        allChanges.forEach(change => {
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

        allRequirements
            .filter(req => req.type === 'ON')
            .forEach(on => onToORsMap.set(on.itemId, []));

        allRequirements
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

        return {
            title: edition.title,
            waves: enrichedWaves,
            operationalChanges: enrichedChanges,
            operationalRequirements: allRequirements
                .filter(req => req.type === 'OR')
                .map(or => ({
                    ...or,
                    satisfiedByChange: reqToChangeMap.get(or.itemId) || null
                })),
            operationalNeeds: allRequirements
                .filter(req => req.type === 'ON')
                .map(on => ({
                    ...on,
                    implementingORs: onToORsMap.get(on.itemId) || [],
                    satisfiedByChange: reqToChangeMap.get(on.itemId) || null
                }))
        };
    }

    async buildRepositoryExportData(userId) {
        // Import services
        const { default: waveService } = await import('./WaveService.js');
        const { default: operationalChangeService } = await import('./OperationalChangeService.js');
        const { default: operationalRequirementService } = await import('./OperationalRequirementService.js');

        // Get ALL data
        const allWaves = await waveService.listItems(userId);
        const allChanges = await operationalChangeService.getAll(userId);
        const allRequirements = await operationalRequirementService.getAll(userId);

        // Enrich waves with milestones
        const enrichedWaves = await this._enrichWavesWithMilestones(allWaves, allChanges, userId);

        // Enrich changes with milestones
        const enrichedChanges = await this._enrichChangesWithMilestones(allChanges, userId);

        // Build reverse lookup: requirement -> satisfying change
        const reqToChangeMap = new Map();

        allChanges.forEach(change => {
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

        allRequirements
            .filter(req => req.type === 'ON')
            .forEach(on => onToORsMap.set(on.itemId, []));

        allRequirements
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

        return {
            title: 'ODP Repository',
            waves: enrichedWaves,
            operationalChanges: enrichedChanges,
            operationalRequirements: allRequirements
                .filter(req => req.type === 'OR')
                .map(or => ({
                    ...or,
                    satisfiedByChange: reqToChangeMap.get(or.itemId) || null
                })),
            operationalNeeds: allRequirements
                .filter(req => req.type === 'ON')
                .map(on => ({
                    ...on,
                    implementingORs: onToORsMap.get(on.itemId) || [],
                    satisfiedByChange: reqToChangeMap.get(on.itemId) || null
                }))
        };
    }

    /**
     * Enrich waves with their associated milestones
     * Groups milestones by wave and includes operational change reference
     */
    async _enrichWavesWithMilestones(waves, operationalChanges, userId) {
        const { default: operationalChangeService } = await import('./OperationalChangeService.js');
        const { idsEqual } = await import('../../../shared/src/model/utils.js');

        // Define the event type order you want
        const eventTypeOrder = [
            'OPS_DEPLOYMENT',
            'API_PREOPS_DEPLOYMENT',
            'API_PUBLICATION',
            'API_DECOMMISSIONING',
            'API_TEST_DEPLOYMENT',
            'UI_TEST_DEPLOYMENT',
            'SERVICE_ACTIVATION',
            'OTHER'
        ];

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
                    const enrichedMilestone = {
                        ...milestone,
                        operationalChange: {
                            id: change.itemId,
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
    async _enrichChangesWithMilestones(operationalChanges, userId) {
        const { default: operationalChangeService } = await import('./OperationalChangeService.js');

        for (const change of operationalChanges) {
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
        }

        return operationalChanges;
    }
}

export default ODPEditionAggregator;