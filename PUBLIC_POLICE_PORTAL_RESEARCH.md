# Public Police Portal Feature Research — CrimeMap

Reviewed 9 October 2026. This document describes **publicly accessible websites only**. Features behind authentication, third-party operational systems and current police deployments are *not* inferred from menus or historical descriptions.

## Public sources reviewed

1. [Puducherry Police official home](https://police.py.gov.in/finalvam.html) — public emergency contact details, crime information, regional crime-statistics directories, station directory, traffic materials, citizen links and prevention resources.
2. [Puducherry Police stations](https://police.py.gov.in/PS%20Profiles%202023/Police%20Stations%20Main%20Page.htm) — district/region-grouped station names, station profiles and linked map resources. Page indicates it was updated on 29 July 2025. It is a *public directory*, not a machine-readable official station location feed.
3. [Puducherry crime statistics](https://police.py.gov.in/Crime%20Statistics/Crime%20Stat%202023/Puducherry%20Crime%20Statistic%20Main%20page.html) — public comparative/statistics documents, including a 2022–2023 region view. These publications are not the fictional incident records in CrimeMap.
4. [Puducherry traffic page](https://police.py.gov.in/Traffic/Traffic%20Unit%20Main%20Page.htm) — traffic unit listings, road-safety guidance and emergency/traffic resources, rather than a publicly verified dispatch API.
5. [Puducherry preventive tips](https://police.py.gov.in/Help%20and%20Preventive%20Tips/HELP%20%26%20PREVENTIVE%20TIPS%20Main%20Page.htm) — prevention/outreach materials on burglary, vehicle theft, safe banking and other topics.
6. [Puducherry CCTNS citizen portal](https://cctnscitizen.py.gov.in/citizen/login.aspx) — publicly listed complaint, verification and request services, e-Zero FIR and citizen login. The actual protected workflows/data are not public.
7. [Ministry of Home Affairs / PIB CCTNS status](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2238241&lang=2&reg=48) — March 11, 2026 statement on standardized CCTNS data entry. Reports 57/57 Puducherry police stations using CCTNS **as of 1 February 2026**; does not grant access to CCTNS data.
8. [Smart Policing Innovations](https://police.py.gov.in/Smart%20Police/Smart%20Policing%20Innovatives%20Main%20Page.htm) — descriptions of CCTNS, control rooms, traffic initiatives, AFIS, Safe City, MITRA and other projects. Some descriptions are historical; listing is not confirmation of current operational status.
9. [Telangana IPMCAP](https://ipmcap.tspolice.gov.in/) — public descriptions of layered crime/accident/CCTV/patrol maps, patrol monitoring and history, mobile field operations, geofence events, analytics, and decision-support ambitions. Internal dashboards, code, live data and integrations are not publicly available.

## Public availability across the requested eight categories

| Category | Reviewable evidence | Appropriate CrimeMap handling |
|---|---|---|
| 1. CCTNS record systems | Public press documentation and citizen portal; secured records inaccessible | Maintain validated structured **synthetic** incidents; **do not impersonate CCTNS** or claim interoperability |
| 2. Citizen services | Public service menus, login and contacts | Offer external official links; do **not** copy government login, collect sensitive citizen information, or duplicate protected forms |
| 3. Crime statistics | Public region-linked reports (historical data) | Keep CrimeMap's synthetic statistics visibly separate; avoid implying actual Puducherry crime counts |
| 4. Police station directory | Public region-grouped station names and maps | Link to source; station coordinates need authorized or verified geocoding before use |
| 5. Emergency/control room | Public official helplines; control-room capabilities partly described | Official contact links only; no simulated dispatch/112 submission presented as real |
| 6. Traffic/road safety | Public unit/road safety materials and older initiatives | Demonstration accident overlays remain fictional, not official traffic incidents |
| 7. Community policing/prevention | Public safety and outreach materials | Optional resource links; not a verified police intelligence feed |
| 8. AFIS / Safe City / MITRA | Older public initiatives descriptions | Research reference, **not** an assertion of accessible, active integrations |

## Architecture decision

**One geospatial page**, four selectable modes: Markers, Heatmap, Grid Analysis and **Operations overlays**. Use one Leaflet map, shared incident API/filters and read-only synthetic operational overlay API. Keep the separate analytics page and incident registry distinct: they represent fundamentally different user workflows.

Recommended future modules, not included in this merge:

- Officer identity, roles, audit logs and source provenance **before** processing real police data.
- Authorized station directories, GPS and camera metadata feeds after privacy and security review.
- Field operations, verified incidents, geofencing and dispatch processes only with authorized integrations.
- Temporal comparisons, methodologically sound uncertainty estimates and decision-support analyses only after sufficient real data and validation.

## What this prototype does NOT claim

No current access to live CCTNS, IPMCAP, FIR databases, dispatch centers, GPS devices, CCTV feeds, real officer locations, or confirmed Puducherry crime hotspots. No public page proves such integration is absent from protected internal systems.

Do not republish real FIRs, victim or witness information, or station operational information without permission. Distinguish "publicly described" from "deployed and verified" when presenting a hackathon novelty argument.
