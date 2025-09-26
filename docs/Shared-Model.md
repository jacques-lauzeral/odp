# Shared Model

## Purpose
The `@odp/shared` workspace provides centralized definitions for enums, entity models, request structures, and utility functions used across all ODP components (server, CLI, web client). This ensures consistency, type safety, and single source of truth for all data structures and validation logic.

## Benefits
- **Single Source of Truth**: Enum values and entity models defined once, used everywhere
- **Type Safety**: Validation functions prevent invalid values across all layers
- **Consistency**: Same definitions across server, CLI, and web client
- **Maintainability**: Easy to add/modify enums and models in one place
- **Tree Shaking**: ES modules allow importing only needed components

## File Organization

### Root Level
```
shared/src/
├── index.js           # Main exports aggregating all modules
└── messages.js        # Request/response model definitions for API operations
```

### Model Package (`/model/`)
```
shared/src/model/
├── drafting-groups.js    # DRG enum (4DT, AIRPORT, etc.) with validation helpers
├── or-types.js          # Operational Requirement types (ON, OR) with validation helpers
├── odp-edition-types.js # ODP Edition types (DRAFT, OFFICIAL) with validation helpers
├── visibility.js        # Visibility levels (NM, NETWORK) with validation helpers
├── milestone-events.js  # Milestone event types (5 specific events) with validation helpers
├── utils.js            # Common utilities (ID normalization, lazy comparison)
├── setup-elements.js   # Setup entity models (StakeholderCategory, Wave, etc.)
└── odp-elements.js     # Operational entity models (OR, OC, Baseline, Edition, Milestone)
```

## Usage Examples

### Import Enums with Validation
```javascript
import { 
  DraftingGroup, 
  isDraftingGroupValid,
  getDraftingGroupDisplay 
} from '@odp/shared';
```

### Import Entity Models
```javascript
import { 
  OperationalRequirement, 
  OperationalChange,
  StakeholderCategory 
} from '@odp/shared';
```

### Import Request Models
```javascript
import { 
  OperationalRequirementRequests,
  OperationalChangeRequests 
} from '@odp/shared';
```

### Import Utilities
```javascript
import { 
  normalizeId, 
  lazyEquals, 
  idsEqual 
} from '@odp/shared';
```

## Enum Pattern
All enums follow a consistent pattern with validation and display helpers:

```javascript
export const EnumName = { 'KEY': 'Display Value' };
export const EnumNameKeys = Object.keys(EnumName);
export const EnumNameValues = Object.values(EnumName);
export const isEnumNameValid = (value) => EnumNameKeys.includes(value);
export const getEnumNameDisplay = (key) => EnumName[key] || key;
```

## Integration
The shared module is imported as `@odp/shared` in all workspace components:
- **Server Layer**: Validation, enum checking, model structures
- **CLI Layer**: Display names, option lists, request formatting
- **Web Client**: Form validation, dropdown options, API requests
- **OpenAPI Specs**: Reference enum values for schema definitions