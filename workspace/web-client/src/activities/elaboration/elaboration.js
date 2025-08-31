import AbstractInteractionActivity from '../common/abstract-interaction-activity.js';

export default class ElaborationActivity extends AbstractInteractionActivity {
    constructor(app) {
        super(app, {
            activityName: 'Elaboration',
            context: 'Repository',
            description: 'Create and edit operational requirements and changes for the next ODP edition',
            mode: 'edit',
            dataSource: 'repository'
        });
    }
}