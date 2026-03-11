# Introduction

The iCDM Guidance Material v4 introduces significant evolutions in the ODIP model:

- revisit of the setup model
- revisit of the ON/OR model introducing stronger differences between ON and OR

This note proposes an adapted version of the ODIP model.

Historically, the ODIP model considers ON/OR as an attribute of a common Requirement class. Therefore, in the ODIP
model, ONs and ORs share the same data model. Therefore, we propose two versions of the Requirement model
- the first version preserves the current ODIP model approach and explains how each attribute will be used
- the second version proposes a more drastic evolution of the ODIP model, that explicitly separate (two classes) ONs 
and ORs

This note is organised as follows:

- Setup model proposal
- ON/OR model proposals
- OC model proposal

The other ODIP model elements, e.g. Baselibe, Edition, etc. are a priori not impacted by the new iCDM Guidance version.

# Setup Model

## StrategicDocument (Strategic Documents)

Represents a Strategic Document.

- id: mandatory - opaque identifier
- name (Name): mandatory - short text
- version (Version): optional - short text
- url (URL): mandatory - URL

## Wave

Represents a release Wave.

- id: mandatory - opaque identifier
- year (Year): mandatory - yyyy
- sequenceNumber (Sequence Number): mandatory - integer
- implementationDate (Implementation Date): optional - date

## StakeholderCategory

Represents a category of stakeholder.

- id: mandatory - opaque identifier
- name (Name): mandatory - short text
- description (Description): mandatory - multiline rich text
- parent (Parent): optional - the parent stakeholder category

## Domain

Represents a business domain.

- id: mandatory - opaque identifier
- name (Name): mandatory - short text
- description (Description): mandatory - multiline rich text
- contact (Contact): optional - multiline rich text
- parent (Parent): optional - the parent domain

## Bandwidth

Represents the per domain yearly effort

- id: mandatory - opaque identifier
- year (Year): mandatory - one year
- wave (Wave): optional - Wave reference - undefined means year
- scope (Scope): optional - Domain reference - undefined means global scope

The (year, wave, scope) tuple shall be considered as a unique bandwidth identifier, i.e. there shall not nbe more than
one Bandwidth with same (year, wave, scope) value.



# ON/OR Model

## Preserving Requirement as unique Class

### Requirement

The unique class supporting ONs and ORs.

Attributes:
(versioning and auditing attributes)
- id: mandatory - opaque identifier
- type (Type): mandatory - ON|OR
- title (Title): mandatory - short text
- statement (Statement): mandatory - multiline rich text
- rationale (Rationale): mandatory - multiline rich text
- flows (Flow Descriptions and Flow Examples): optional - multiline rich text
- privateNotes (Private Notes): optional - multiline rich text
- additionalDocumentation (Additional Documentation): optional - a placeholder for attachments
- maturity (Maturity Level): mandatory - DRAFT, ADVANCED, or MATURE

- refines (Refines): optional - the refined (parent) Requirement (of same type)

- domain (Domain): mandatory for ONs, forbidden forORs - a Domain reference
- documentReferences (Strategic Documents (and entry points)): mandatory for root ON, optional otherwise - 0..* annotated references to Reference Documents
- tentative (Tentative Implementation Time): mandatory for root ON, optional for child ONs, forbidden for ORs - either a year or a year period

- implementedONs (Implements): forbidden for ONs, mandatory for root ORs, optional otherwise - the list of implemented ONs
- impactedStakeholders: forbidden for ONs, mandatory for root ORs, optional otherwise - the list of impacted stakeholder categories
- impactedDomains: forbidden for ONs, mandatory for root ORs, optional otherwise - the list of impacted domains
- nfrs (NFRs): optional - non-functional requirements as seen from business perspective

## Requirement as base class, ON and OR as Specialisations

### Requirement

The abstraction of an ON/OR

Attributes:
(versioning and auditing attributes)
- id: mandatory - opaque identifier
- title (Title): mandatory - short text
- statement (Statement): mandatory - multiline rich text
- rationale (Rationale): mandatory - multiline rich text
- flows (Flow Descriptions and Flow Examples): optional - multiline rich text
- privateNotes (Private Notes): optional - multiline rich text
- additionalDocumentation (Additional Documentation): optional - a placeholder for attachments
- maturity (Maturity Level): mandatory - DRAFT, ADVANCED, or MATURE

## ON

The Requirement specialisation that represents an ON.

Attributes:
- domain (Domain): mandatory - a Domain reference
- refines (Refines): optional - the refined (parent) ON
- documentReferences (Strategic Documents (and entry points)): mandatory for root ON, optional otherwise - 0..* annotated Reference Documents
- tentative (Tentative Implementation Time): mandatory for root ON, optional otherwise - year period (open <= close)

## OR

The Requirement specialisation that represents an OR.

Attributes:
- refines (Refines): optional - the refined (parent) OR
- implementedONs (Implements): mandatory for root ORs, optional otherwise - the list of implemented ONs
- dependencies (Dependencies): optional - the list of ORs that must be implemented before this OR
- impactedStakeholders: mandatory for root ORs, optional otherwise - the list of impacted stakeholder categories
- impactedDomains: mandatory for root ORs, optional otherwise - the list of impacted domains

# OC Model

## OC

Represents an OC.

Attributes:
(versioning and auditing attributes)
- id: mandatory - opaque identifier
- title (Title): mandatory - short text
- purpose (Purpose): mandatory - multiline rich text
- initialState (Initial State): mandatory - multiline rich text
- finalState (Final State): mandatory - multiline rich text
- details (Details): mandatory - multiline rich text
- implementedORs (Implemented ORs): mandatory - the list of implemented ORs
- decommissionedORs (Decommissioned ORs): mandatory - the list of decommissioned ORs
- dependencies (Dependencies): optional - the list of OCs that must be deployed before this OC
- milestones (Milestones): optional - the list of deployment milestones
- privateNotes (Private Notes): optional - multiline rich text
- additionalDocumentation (Additional Documentation): optional - a placeholder for attachments
- maturity (Maturity Level): mandatory - DRAFT, ADVANCED, or MATURE
- cost (Cost): optional - integer
- orCosts (OR Costs): optional - list of OR costs

## Milestone

Represents an OC deployment milestone.

Attributes:
- name (Name): mandatory - short text
- description (Description): optional - multiline rich text
- wave (Wave): mandatory - wave reference
- eventTypes (Event Types): mandatory list of event types

## ORCost

Represents the Cost of an OR in the context of an OC.

Attributes:
- cost (Cost): mandatory - integer
- or (OR): mandatory - the OR reference
