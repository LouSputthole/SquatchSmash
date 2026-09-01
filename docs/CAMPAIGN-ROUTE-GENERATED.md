# Campaign route — generated contract

> Generated from `src/core/campaign-spine.js`. Do not hand-edit this file.
> `docs/CAMPAIGN-STORY-BIBLE.md` remains the creative authority; this is the
> deterministic implementation-facing route derived from the live spine.

Beats: **31** · Chapters: **6** · Pending: **0**

## Prospect

| # | Beat id | Title | Scene | Spawn | Residence | Status | Exit contract |
|---:|---|---|---|---|---|---|---|
| 0 | `squatch_smash_intro` | Squatch Smash Intro | `apartment` | `wake` | `starter` | wired | Quit is intercepted as a story action. The camera pulls back out of the monitor rather than cutting. |
| 1 | `first_apartment` | First Apartment | `apartment` | continue | `starter` | wired | Lou rings about forty seconds after the reveal: come down to the Bing. |
| 2 | `bada_bing_one` | Bada Bing I | `bada_bing_one` | `driver_seat` | `starter` | wired | Margo’s number, James Blond, and the Squatchfather job. A family driver is already waiting. |
| 3 | `squatchfather` | The Squatchfather | `squatchfather` | `restaurant_exterior` | `cabin` | wired | The same driver takes him straight to the cabin. He does not go home. |
| 4 | `cabin_lay_low` | Cabin I: Lay Low | `countryside_cabin` | `arrival` | `cabin` | wired | Lou: good job, stay quiet. The four walks lead to the one outgoing Margo conversation in the campaign; MARGO_CALL_READY is only the observational setup seam, and the Cabin owns the call itself. |
| 5 | `booski_sasole_call` | Booski / Sasole Call | `countryside_cabin` | continue | `cabin` | wired | Booski: Captain Sasole needs a hand, and you are already out here. This is where the light half of the cabin chapter ends. |
| 6 | `beef_run` | Beef Run | `airstrip_smuggling` | `hangar` | `cabin` | wired | Lands clean. Sasole runs him back to the cabin rather than to a flat he is supposed to be hiding from. |
| 7 | `cabin_two` | Cabin II: the dungeon | `countryside_cabin` | `wake` | `starter` | wired | The dark half of the cabin chapter: Gratin calls, the cellar and the dungeon open, the interrogation yields a mole with no name and the phrase Short Bus, the executions, the pyre, the blackout. Then Booski: the heat is down and Ol’ Billy is getting out, come back to the Bing. |

## Family Business

| # | Beat id | Title | Scene | Spawn | Residence | Status | Exit contract |
|---:|---|---|---|---|---|---|---|
| 8 | `bada_bing_two` | Bada Bing II: Billy Hotdog | `bada_bing_two` | `driver_seat` | `starter` | wired | The party turns. Billy dies and the cleanup starts in the room. |
| 9 | `graveyard` | Graveyard | `squatch_graveyard` | `headlights` | `motel` | wired | Buried. Snow: when Billy misses breakfast, familiar doors get watched. The Motel is cover until daylight. |
| 10 | `jerky_motel` | Jerky Hotel / Motel | `jerky_motel` | `passenger_seat` | `motel` | wired | Survive the deal and getaway, wait for daylight, then Snow drops him home once the block is clean. |
| 11 | `return_to_old_apartment` | Return to Old Apartment | `apartment` | `front_door` | `starter` | wired | Normal life, and it does not feel the same. |
| 11.5 | `bank_heist` | THE TAKE | `bank_heist` | `safehouse` | `starter` | wired | Home, and the flat needs cleaning before anybody sees it. |

## Moving Up

| # | Beat id | Title | Scene | Spawn | Residence | Status | Exit contract |
|---:|---|---|---|---|---|---|---|
| 12 | `new_space_call` | Lou’s ‘New Space’ Call | `apartment` | continue | `starter` | wired | We got a new space. Come meet us on the course. Prospect travels to Silver Pines. |
| 13 | `silver_pines` | Silver Pines Golf Course | `silver_pines` | `car_park` | `starter` | wired | Three holes of being included, and the keys to somewhere better. |
| 14 | `luxury_apartment_intro` | Luxury Apartment Introduction | `luxury_apartment` | `arrival` | `luxury` | wired | Lou’s reward for taking care of that thing for him. Get ready for your date. The starter flat goes dark from here. |
| 15 | `front_and_center` | Front & Center / Margo Date | `silver_room` | `kerb` | `luxury` | wired | She comes home with him. |
| 16 | `margo_stayover` | Margo Stayover | `luxury_apartment` | `main` | `luxury` | wired | Sleep. Nothing criminal rings tonight. |
| 17 | `luxury_apartment_morning` | Luxury Apartment Morning | `luxury_apartment` | `bed` | `luxury` | wired | She leaves. A quiet minute. Then the phone. |
| 18 | `no_wake` | No Wake | `no_wake` | `gate_c` | `luxury` | wired | A wire recording proves Willy leaked an earlier strip operation. He never confesses; he goes in a bag, and the Prospect is trusted with something genuinely internal. This is separate from Sauce later giving the Silver Case and mansion target to the A-Team. |
| 19 | `luxury_apartment_return` | Luxury Apartment Return | `luxury_apartment` | `main` | `luxury` | wired | Quiet, then a call about something sensitive that needs moving. |

## The Inner Circle

| # | Beat id | Title | Scene | Spawn | Residence | Status | Exit contract |
|---:|---|---|---|---|---|---|---|
| 20 | `silver_case_setup` | Silver Case Setup | `silver_case` | `car_ride` | `luxury` | wired | He has custody of the case and orders to hand it to Lou himself. |
| 21 | `silver_case_mansion` | Silver Case → Mansion | `mansion` | `gate` | `mansion_guest` | wired | Lou opens it, calls it Squatchanium, and sends him down to Booski. |
| 22 | `silent_squatch` | Mansion / Silent Squatch | `mansion` | `cellar` | `mansion_guest` | wired | Lou: things are hot right now, why don’t you stay here, Prospect. He takes the hint. He learns the house while it is still peaceful. |

## War

| # | Beat id | Title | Scene | Spawn | Residence | Status | Exit contract |
|---:|---|---|---|---|---|---|---|
| 23 | `mansion_siege` | Mansion Siege | `mansion_siege` | `guest_suite` | `mansion_guest` | wired | Repelled. Lou answers the A-Team threat, names the route package recovered from their command car, and sends the Prospect to Sasole. |
| 24 | `enola_squatch` | SQUATCHOLA GAY | `enola_squatch` | `airfield` | `transit` | wired | The city is gone. Nobody in the air says otherwise. |
| 25 | `mansion_return` | Repaired Mansion | `mansion_return` | `driveway` | `luxury` | wired | A few days on. Lou explains which city it actually was. Sauce is missing; his restaurant burner and an estate gate log produce a separate address for an unnamed A-Team leadership estate. The Palace -- not this briefing -- proves whether Sauce was taken or turned. |
| 26 | `cartel_palace` | Cartel Palace | `cartel_palace` | `approach` | `luxury` | wired | Sauce, Mark and the whole crew. The war is over and he does not know what that has earned him. |

## This Thing of Ours

| # | Beat id | Title | Scene | Spawn | Residence | Status | Exit contract |
|---:|---|---|---|---|---|---|---|
| 27 | `special_meeting_call` | Luxury Apartment: Special Meeting | `luxury_apartment` | `main` | `luxury` | wired | Booski: special one. Seff, Lag and Numbskull are coming to get you. He will not say why. |
| 28 | `pickup_ride` | Pickup / Ride | `special_meeting` | `kerb` | `transit` | wired | Forty-two minutes, and something moving in the trunk. |
| 29 | `initiation` | Initiation Cabin | `initiation` | `gathering` | `initiation_cabin` | wired | Made. Credits roll. |
