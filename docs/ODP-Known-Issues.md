# ODP Known Issues

## Introduction

### Purpose

The purpose of this note is to centralise the ODP tooling reported issues.

See also deprecated document 'Known Issues'.

## Overview

| `####` | `S/C/W/P` | Title                                                                        | `S/E/P` | Status |
|--------|-----------|------------------------------------------------------------------------------|---------|--------|
| `0001` | `S/C/W/-` | Decommissioned data category management                                      | `L/M/M` |        |
| `0002` | `-/-/W/-` | Cannot create a child stakeholder/service                                    | `L/L/M` | Solved |
| `0003` | `-/-/W/-` | Cannot update the parent of an existing stakeholder/service                  | `L/L/M` |        |
| `0004` | `S/C/W/-` | No support for Strategic Objectives (SO)                                     | `H/M/M` |        |
| `0005` | `-/-/W/-` | Incorrect wave year upper bound 2030                                         | `L/L/L` |        |
| `0006` | `S/C/W/-` | No Year/Quarter/Date consistency validation at wave create/update time       | `L/L/M` |        |
| `0007` | `-/-/W/-` | Cannot delete a stakeholder/service that has one or more children            | `L/L/M` |        |
| `0008` | `-/-/W/-` | Incorrect 'Flows' field label                                                | `L/L/M` |        |
| `0009` | `S/C/W/-` | Can create an OR that refines an ON                                          | `H/L/H` |        |
| `0010` | `S/C/W/-` | Error 400 without explanation when trying to create an ON that refines an OR | `H/L/H` |        |
| `0011` | `-/-/-/P` | ON/OR code shall be displayed instead of internal ID                         | `M\L\M` |        |
| `0012` | `-/-/W/-` | DrG, Path, Requirement type shall be pre-filed on new requirement            | `H\M\H` |        |
| `0013` | `-/-/W/-` | 'New Requirement' action label shall be 'New ON/OR'                          | `L/L/M` |        |
| `0014` | `S/C/W/-` | Code allocation fails when creating ON/OR without DrG - shall be NM-XXX      | `L/M/M` |        |
| `0015` | `S/C/W/-` | Cannot set ON/OR parent out of a DrG - see 0014                              | `L/M/M` |        |
| `0016` | `S/C/W/-` | Cannot set delete an ON/OR                                                   | `H/H/H` |        |
| `0017` | `-/-/W/-` | Cannot create an ON/OR with a 2 tokens path                                  | `H/H/H` |        |
| `0018` | `-/-/W/-` | Cannot move an ON/OR folder to another parent folder                         | `H/H/H` |        |
| `0019` | `-/-/W/-` | No ON/OR filtering by refined requirement                                    | `L/L/M` |        |
| `0020` | `-/-/W/-` | Filter bar occupies too much horizontal space                                | `M/M/H` |        |
| `0021` | `-/-/W/-` | No OC filtering by satisfied OR                                              | `L/L/M` |        |
| `0022` | `S/-/-/-` | OC filtering by impact not working                                           | `L/M/M` |        |
| `    ` | `       ` |                                                                              | `     ` |        |

--- 
* S: Server
* C: CLI
* W: Web Client
* P: Publication

----
* S: Severity - H | M | L
* E: Effort - H | M | L
* P: Priority - H | M | L

## Main Topics for Improvements

### Capabilities and User Experience

#### ON/OR Organisation (folder, path, refines)

* setting the location of an ON/OR
* moving an ON/OR
* interacting with folders - create, rename, move, delete

#### ON/OR Smooth Delete 

* mark ON/OR as deleted/deprecated
* possibility to query deleted/deprecated ONs/ORs

#### Model Improvements
* align with version 4
  * remove data impact
  * ON target period
  * ON SLO linking
  * OR effort estimates / priority

#### ON/OR Filtering

* remove data category support
* ensure service/stakeholder filtering considers the service/stakeholder hierarchy

#### ON/OR Version History

* Give access to the ON/OR version history (datetime + author)
* Diff reporting between two selected version
* Possibility to restore an old version

#### UI Refresh

* Ensure that no old form remains after save

#### UI Error Messaging

* Improve the visibility of the error messages / error locations (for example, in a form, the error may come from another tab field)

#### UI Misc
- Review process - allow a reviewer to record comments / a contributor to answer and handle review comments

- Version history - allow a reviewer/author to visualise the version history of a requirement/change
  - collection:
    - master table: version id/number | date | author | delta (v-1) overview
    - selection details: summary (version id/number | date | author) | delta (v-1) details + action show entity details

- Temporal view
  - Overview
    - The temporal view is organised in three components arranged vertically:
      - top: Timeline bounds, Change filtering, Timeline policy
      - center: Temporal grid
      - bottom: change / milestone master details
    - view presents the operational changes on a 2D diagram:
  - Top Area
    - Timeline bounds
      - The user can fix the lower and upper limit of the timeline - default is next wave date - next wave date + 3 years
    - Change filtering
      - The user has access ot the same filtering capabilities as with the change collection
    - Timeline policy - The user can select a timeline policy:
      - unique - default - a single timeline
      - per milestone event type - one timeline per milestone event type
      - per impact service, stakeholder, data, or regulatory aspect - one timeline per impact perspective
      - per operational change
  - Center Area
    - horizontal timeline(s)
    - vertical wave lines
    - intersection points represent events, i.e. 0..n change milestones -think to visual indication associated to each event type and of which superposition can be interpreted, e.g. |.... meaning API Publication, ||... meaning API Publication and Test deployment...
  - Bottom Area
    - A master details collection view
      - Master columns
        - Change Title / Milestone Name, e.g. Projects/M1
        - Event Type, e.g. API Publication
        - ...
      - Details
        - Milestone first, then change
        - action show details

  - Interactions
    - Center Area
      - Timeline selection => filters the master details change/milestone collection
      - Wave selection => filters the master details change/milestone collection
      - Event selection => filters the master details change/milestone collection
    - Bottom Area
      - Milestone / change selection => emphasise the selected milestone/change in the center area

#### Help / User Guide

* Integrate a help in the UI

#### Navigability

* Between ONs / ORs
* To setup elements

### Admin and Support

#### User Identification

* It would be good to reuse the EC usernames, e.g. yaml config including: user, email, complete name

#### User Activity Recording

tbd

#### Repository backup

* Automated periodic backup recording

