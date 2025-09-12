# Known issues
- Web Client
  - Elaboration (server?)
    - CRITICAL: Save requirement/change ends in error???
    - CRITICAL: Save a project, e.g. after updating the description) result in lost milestones???
  - Elaboration/Review
    - Requirement filtering
      - MINOR: no filtering by refined requirement(s)
    - Change filtering 
      - MINOR: no filtering by satisfied requirements (missing column config? something already exists)
      - MINOR: no filtering by impact not working
    - MAJOR: no Requirement / Change grouping - does not work properly, cannot group by more than 2 values
- API - MINOR: no patch milestone method supported

# Next capabilities
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
