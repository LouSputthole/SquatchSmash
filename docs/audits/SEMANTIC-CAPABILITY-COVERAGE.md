# Semantic Capability Coverage

Generated from the live scene-contract registry. This report tracks player-facing capability coverage instead of raw assertion count.

**Interpretation:** REQUIRED means contracted, not a live PASS. DEBT, KNOWN FAILURE, and UNKNOWN are blockers. INTENTIONAL N/A is allowed only when the scene contract supplies the reason. Runtime certification remains the responsibility of the semantic browser verifier.

Entrypoints: 22; capability cells: 220; REQUIRED=166, DEBT=49, KNOWN FAILURE=2, INTENTIONAL N/A=1, UNKNOWN=2.

Behavioral contract ready: NO.

| Entrypoint | Scene | Href | entry | spawn | boot | input | camera | objective | interaction | checkpoint | minimum_subjects | progression |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| apartment_canonical | Apartment | index.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | DEBT | REQUIRED | REQUIRED | UNKNOWN | REQUIRED |
| bada_bing_one_canonical | Bada Bing — first visit | bing.html | REQUIRED | REQUIRED | REQUIRED | DEBT | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| squatchfather_canonical | Squatchfather | squatchfather.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | REQUIRED | DEBT | REQUIRED | REQUIRED | REQUIRED |
| airstrip_smuggling_canonical | The Beef Run | beefrun.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | DEBT | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| bada_bing_two_hotdog | The HotDog Incident | bing.html?visit=2 | REQUIRED | REQUIRED | REQUIRED | DEBT | REQUIRED | DEBT | REQUIRED | DEBT | REQUIRED | REQUIRED |
| bada_bing_two_legacy_main | The HotDog Incident | bing.html | KNOWN FAILURE | REQUIRED | REQUIRED | DEBT | REQUIRED | DEBT | REQUIRED | DEBT | REQUIRED | KNOWN FAILURE |
| squatch_graveyard_canonical | Squatch Graveyard | graveyard.html | REQUIRED | REQUIRED | REQUIRED | DEBT | REQUIRED | REQUIRED | REQUIRED | DEBT | REQUIRED | REQUIRED |
| jerky_motel_canonical | The Jerky Motel | motel.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | DEBT | DEBT | UNKNOWN | REQUIRED | REQUIRED |
| no_wake_canonical | NO WAKE | nowake.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | DEBT | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| silver_room_canonical | The Silver Room | silver.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| silver_pines_canonical | A Morning at Silver Pines | golf.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | REQUIRED | REQUIRED | DEBT | REQUIRED | REQUIRED |
| bank_heist_canonical | THE TAKE | heist.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | DEBT | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| luxury_apartment_canonical | The Luxury Apartment | luxury-apartment.html | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| countryside_cabin_canonical | The Countryside Cabin | cabin.html | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| silver_case_canonical | The Silver Case | silvercase.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| mansion_siege_canonical | Mansion Under Siege | mansion-siege.html | REQUIRED | REQUIRED | REQUIRED | DEBT | REQUIRED | DEBT | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| enola_squatch_canonical | SQUATCHOLA GAY | enolasquatch.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | DEBT | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| mansion_return_query_variant | Repaired Mansion Return | mansion.html?visit=return | DEBT | REQUIRED | REQUIRED | DEBT | REQUIRED | REQUIRED | REQUIRED | INTENTIONAL N/A | REQUIRED | DEBT |
| cartel_palace_canonical | Cartel Palace | cartel-palace.html | REQUIRED | REQUIRED | REQUIRED | DEBT | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| special_meeting_canonical | The Special Meeting | specialmeeting.html | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED |
| initiation_canonical | Initiation Night | initiation.html | REQUIRED | REQUIRED | REQUIRED | REQUIRED | DEBT | REQUIRED | DEBT | REQUIRED | REQUIRED | REQUIRED |
| mansion_canonical | Lou’s Mansion / Project Silent Squatch | mansion.html | REQUIRED | REQUIRED | REQUIRED | DEBT | DEBT | REQUIRED | REQUIRED | DEBT | REQUIRED | REQUIRED |

## Capability Totals

| Capability | REQUIRED | DEBT | KNOWN FAILURE | UNKNOWN | INTENTIONAL N/A |
| --- | ---: | ---: | ---: | ---: | ---: |
| entry | 20 | 1 | 1 | 0 | 0 |
| spawn | 22 | 0 | 0 | 0 | 0 |
| boot | 22 | 0 | 0 | 0 | 0 |
| input | 4 | 18 | 0 | 0 | 0 |
| camera | 10 | 12 | 0 | 0 | 0 |
| objective | 13 | 9 | 0 | 0 | 0 |
| interaction | 19 | 3 | 0 | 0 | 0 |
| checkpoint | 15 | 5 | 0 | 1 | 1 |
| minimum_subjects | 21 | 0 | 0 | 1 | 0 |
| progression | 20 | 1 | 1 | 0 | 0 |
