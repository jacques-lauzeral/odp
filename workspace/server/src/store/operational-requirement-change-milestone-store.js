import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

export class OperationalChangeMilestoneStore extends BaseStore {
    constructor(driver) {
        super(driver, 'OperationalChangeMilestone');
    }

    // BELONGS_TO Relationship Methods

    async createBelongsToRelation(milestoneId, changeItemId, transaction) {
        try {
            // Validate milestone exists
            const milestoneExists = await this.exists(milestoneId, transaction);
            if (!milestoneExists) {
                throw new StoreError('Milestone does not exist');
            }

            // Validate change item exists
            const changeExists = await transaction.run(`
        MATCH (change:OperationalChange)
        WHERE id(change) = $changeItemId
        RETURN id(change) as id
      `, { changeItemId });

            if (changeExists.records.length === 0) {
                throw new StoreError('Change item does not exist');
            }

            // Create BELONGS_TO relationship
            const result = await transaction.run(`
        MATCH (milestone:${this.nodeLabel}), (change:OperationalChange)
        WHERE id(milestone) = $milestoneId AND id(change) = $changeItemId
        CREATE (milestone)-[:BELONGS_TO]->(change)
        RETURN count(*) as created
      `, { milestoneId, changeItemId });

            return result.records[0].get('created').toNumber() > 0;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create BELONGS_TO relationship: ${error.message}`, error);
        }
    }

    async deleteBelongsToRelation(milestoneId, changeItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (milestone:${this.nodeLabel})-[r:BELONGS_TO]->(change:OperationalChange)
        WHERE id(milestone) = $milestoneId AND id(change) = $changeItemId
        DELETE r
        RETURN count(*) as deleted
      `, { milestoneId, changeItemId });

            return result.records[0].get('deleted').toNumber() > 0;
        } catch (error) {
            throw new StoreError(`Failed to delete BELONGS_TO relationship: ${error.message}`, error);
        }
    }

    async replaceBelongsToRelation(milestoneId, changeItemId, transaction) {
        try {
            // Delete existing BELONGS_TO relationship (milestone can only belong to one change)
            await transaction.run(`
        MATCH (milestone:${this.nodeLabel})-[r:BELONGS_TO]->(:OperationalChange)
        WHERE id(milestone) = $milestoneId
        DELETE r
      `, { milestoneId });

            // Create new relationship
            return await this.createBelongsToRelation(milestoneId, changeItemId, transaction);
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to replace BELONGS_TO relationship: ${error.message}`, error);
        }
    }

    async findBelongsToChange(milestoneId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (milestone:${this.nodeLabel})-[:BELONGS_TO]->(change:OperationalChange)
        WHERE id(milestone) = $milestoneId
        RETURN id(change) as id, change.title as title
      `, { milestoneId });

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            return {
                id: record.get('id').toNumber(),
                title: record.get('title')
            };
        } catch (error) {
            throw new StoreError(`Failed to find BELONGS_TO change: ${error.message}`, error);
        }
    }

    async findMilestonesByChange(changeItemId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (change:OperationalChange)<-[:BELONGS_TO]-(milestone:${this.nodeLabel})
        WHERE id(change) = $changeItemId
        RETURN id(milestone) as id, milestone.title as title, milestone.description as description,
               milestone.eventTypes as eventTypes
        ORDER BY milestone.title
      `, { changeItemId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find milestones by change: ${error.message}`, error);
        }
    }

    // TARGETS Relationship Methods

    async createTargetsRelation(milestoneId, waveId, transaction) {
        try {
            // Validate milestone exists
            const milestoneExists = await this.exists(milestoneId, transaction);
            if (!milestoneExists) {
                throw new StoreError('Milestone does not exist');
            }

            // Validate wave exists
            const waveExists = await transaction.run(`
        MATCH (wave:Wave)
        WHERE id(wave) = $waveId
        RETURN id(wave) as id
      `, { waveId });

            if (waveExists.records.length === 0) {
                throw new StoreError('Wave does not exist');
            }

            // Create TARGETS relationship
            const result = await transaction.run(`
        MATCH (milestone:${this.nodeLabel}), (wave:Wave)
        WHERE id(milestone) = $milestoneId AND id(wave) = $waveId
        CREATE (milestone)-[:TARGETS]->(wave)
        RETURN count(*) as created
      `, { milestoneId, waveId });

            return result.records[0].get('created').toNumber() > 0;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create TARGETS relationship: ${error.message}`, error);
        }
    }

    async deleteTargetsRelation(milestoneId, waveId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (milestone:${this.nodeLabel})-[r:TARGETS]->(wave:Wave)
        WHERE id(milestone) = $milestoneId AND id(wave) = $waveId
        DELETE r
        RETURN count(*) as deleted
      `, { milestoneId, waveId });

            return result.records[0].get('deleted').toNumber() > 0;
        } catch (error) {
            throw new StoreError(`Failed to delete TARGETS relationship: ${error.message}`, error);
        }
    }

    async replaceTargetsRelation(milestoneId, waveId, transaction) {
        try {
            // Delete existing TARGETS relationship (milestone can only target one wave)
            await transaction.run(`
        MATCH (milestone:${this.nodeLabel})-[r:TARGETS]->(:Wave)
        WHERE id(milestone) = $milestoneId
        DELETE r
      `, { milestoneId });

            // Create new relationship
            return await this.createTargetsRelation(milestoneId, waveId, transaction);
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to replace TARGETS relationship: ${error.message}`, error);
        }
    }

    async findTargetsWave(milestoneId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (milestone:${this.nodeLabel})-[:TARGETS]->(wave:Wave)
        WHERE id(milestone) = $milestoneId
        RETURN id(wave) as id, wave.year as year, wave.quarter as quarter, 
               wave.date as date, wave.name as name
      `, { milestoneId });

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            return {
                id: record.get('id').toNumber(),
                year: record.get('year').toNumber(),
                quarter: record.get('quarter').toNumber(),
                date: record.get('date'),
                name: record.get('name')
            };
        } catch (error) {
            throw new StoreError(`Failed to find TARGETS wave: ${error.message}`, error);
        }
    }

    async findMilestonesByWave(waveId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (wave:Wave)<-[:TARGETS]-(milestone:${this.nodeLabel})
        WHERE id(wave) = $waveId
        RETURN id(milestone) as id, milestone.title as title, milestone.description as description,
               milestone.eventTypes as eventTypes
        ORDER BY milestone.title
      `, { waveId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find milestones by wave: ${error.message}`, error);
        }
    }

    // Combined queries for milestone context

    async findMilestoneWithContext(milestoneId, transaction) {
        try {
            const milestone = await this.findById(milestoneId, transaction);
            if (!milestone) {
                return null;
            }

            const change = await this.findBelongsToChange(milestoneId, transaction);
            const wave = await this.findTargetsWave(milestoneId, transaction);

            return {
                ...milestone,
                change,
                wave
            };
        } catch (error) {
            throw new StoreError(`Failed to find milestone with context: ${error.message}`, error);
        }
    }

    async findMilestonesByChangeAndWave(changeItemId, waveId, transaction) {
        try {
            const result = await transaction.run(`
        MATCH (change:OperationalChange)<-[:BELONGS_TO]-(milestone:${this.nodeLabel})-[:TARGETS]->(wave:Wave)
        WHERE id(change) = $changeItemId AND id(wave) = $waveId
        RETURN id(milestone) as id, milestone.title as title, milestone.description as description,
               milestone.eventTypes as eventTypes
        ORDER BY milestone.title
      `, { changeItemId, waveId });

            return result.records.map(record => ({
                id: record.get('id').toNumber(),
                title: record.get('title'),
                description: record.get('description'),
                eventTypes: record.get('eventTypes')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find milestones by change and wave: ${error.message}`, error);
        }
    }
}