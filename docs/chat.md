# WhatsApp Inspector Bot - Conversation Examples

This document contains detailed conversation examples showing how inspectors interact with the WhatsApp bot during property inspections.

## Daily Morning Routine - HDB Inspection in Woodlands

```
7:30 AM - Automated Reminder
Bot: "Good morning Ken! You have 3 inspections today:
[1] Mr. Tan - Blk 123 Woodlands Dr 14 #05-234 (10:00 AM) - 4-Room HDB
[2] Ms. Rachel - Blk 456 Admiralty Link #12-567 (2:00 PM) - 3-Bedroom Condo
[3] Mr. Lim - 789 Sembawang Close #03-89 (4:30 PM) - 3-Room HDB
Reply 'ready' when you want to start your day."

8:15 AM - Inspector Begins Day
Ken: "ready"
Bot: "Hi Ken! Which inspection would you like to start with?
[1] Mr. Tan - Blk 123 Woodlands Dr 14 #05-234 (10:00 AM)
[2] Ms. Rachel - Blk 456 Admiralty Link #12-567 (2:00 PM)
[3] Mr. Lim - 789 Sembawang Close #03-89 (4:30 PM)
Type the number to select a job."
Ken: "1"
Bot: "Job Details:
📍 Mr. Tan Ah Kow
📍 Blk 123 Woodlands Dr 14 #05-234
📱 +65 9123 4567
🏠 4-Room HDB Flat
⏰ Scheduled: 10:00 AM
Type 'start' when you arrive at the location."
```

## Arrival and Job Initiation - Woodlands HDB

```
9:55 AM - At Property Location
Ken: "start"
Bot: "Creating inspection session for Mr. Tan's property...
✅ New inspection thread created
Please confirm you're at Blk 123 Woodlands Dr 14 #05-234"
Ken: "yes"
Bot: "Great! Let's begin the inspection.
Available areas to inspect:
[1] Living Room
[2] Kitchen
[3] Master Bedroom
[4] Bedroom 2
[5] Common Bathroom
[6] Master Bathroom
[7] Service Yard
[8] Bomb Shelter/Storeroom
Type the number to select an area."
```

## Room-by-Room Inspection Flow - Master Bedroom

```
10:05 AM - Location Selection
Ken: "1"
Bot: "Starting inspection for Living Room.
Tasks to complete:
[1] Check main door condition
[2] Check windows and grilles
[3] Check flooring condition
[4] Check walls and ceiling
[5] Check electrical points
[6] Check air-con (if applicable)
Type the number to select a task."

10:06 AM - Task Execution
Ken: "1"
Bot: "Inspecting: Main door condition
Please check:
- Door alignment and closing
- Lock mechanism
- Door frame condition
- Any visible damage
Send photos and type your observations."

Ken: [Uploads 2 photos of door]
Ken: "Door has minor scratches on bottom panel, lock working fine, slight gap at top corner of frame"
Bot: "✅ Recorded for main door. Any additional comments?"
Ken: "recommend touch up paint for scratches"
Bot: "Comments saved. Type 'done' to complete this task or add more photos."
Ken: "done"
Bot: "✅ Main door check completed

Remaining tasks in Living Room:
[2] Check windows and grilles
[3] Check flooring condition
[4] Check walls and ceiling
[5] Check electrical points
[6] Check air-con (if applicable)
Type the number for next task or 'next room' to move on."
```

## Handling Defects - Kitchen Water Damage

```
10:35 AM - Critical Issue Found
Ken: "2" [Selecting Kitchen]
Bot: "Starting inspection for Kitchen. Tasks available:
[1] Check sink and taps
[2] Check kitchen cabinets
[3] Check flooring/wall tiles
[4] Check windows
[5] Check electrical points
[6] Check gas supply
Type the number to select a task."

Ken: "1"
Bot: "Inspecting: Sink and taps
Check for leaks, water pressure, and drainage."

Ken: [Uploads 3 photos showing water stains]
Ken: "URGENT - found water leak under sink, cabinet base damaged, mold starting to form"
Bot: "⚠️ Critical issue noted. Do you need to notify the customer immediately?"
Ken: "yes"
Bot: "I'll flag this for immediate attention. Please provide detailed observations for the report."
Ken: "Active leak from pipe joint under sink. Water damage extends to cabinet base board - approximately 30cm x 20cm area affected. Early stage mold visible. Recommend immediate plumber attention."
Bot: "Critical issue documented. Severity: HIGH
Task marked with priority flag.
Continue with kitchen inspection? Type 'yes' or 'skip'."
```

## Handling Restricted Areas - Tenant Privacy

```
11:15 AM - Access Limitation
Ken: "3" [Selecting Master Bedroom]
Bot: "Starting inspection for Master Bedroom. Tasks available..."

Ken: "Cannot access - tenant belongings everywhere"
Bot: "Understood. How would you like to proceed?
[1] Skip this room entirely
[2] Partial inspection (visible areas only)
[3] Request tenant to clear space
[4] Schedule return visit
Type the number to select an option."

Ken: "2"
Bot: "Noted: Partial inspection only for Master Bedroom.
Please document what you can observe and photograph only clear areas.
Add note about access limitations."

Ken: "Can only check windows and visible walls. Too many personal items blocking floor and power points"
Bot: "Access limitation recorded. This will be noted in the report.
Continue with available tasks or move to next room?"
```

## Completion and Transition - First Job Done

```
11:45 AM - Wrapping Up
Ken: "all rooms done"
Bot: "Inspection Summary for Mr. Tan:
✅ Living Room - Completed
✅ Kitchen - Completed (1 CRITICAL issue)
⚠️ Master Bedroom - Partial (access limited)
✅ Bedroom 2 - Completed
✅ Common Bathroom - Completed
✅ Master Bathroom - Completed
✅ Service Yard - Completed
✅ Store Room - Completed

Total photos: 47
Critical issues: 1
Partial inspections: 1

Type 'complete' to finalize or 'review' to check any area again."

Ken: "complete"
Bot: "Inspection for Mr. Tan completed at 11:45 AM
Duration: 1 hour 50 minutes
Admin has been notified about the critical kitchen issue.

Your next appointment:
Ms. Rachel - Blk 456 Admiralty Link #12-567 at 2:00 PM
Type 'next job' when ready or 'break' to pause."
```

## Lunch Break and Second Job - Admiralty Condo

```
12:00 PM - Break Management
Ken: "break"
Bot: "Enjoy your break, Ken!
Next inspection at 2:00 PM (in 2 hours)
I'll send you a reminder at 1:30 PM.
Reply 'back' when you're ready to continue."

1:30 PM - Automated Reminder
Bot: "Hi Ken! Reminder: Ms. Rachel's inspection at 2:00 PM
📍 Blk 456 Admiralty Link #12-567
🏠 3-Bedroom Condo
📱 +65 9234 5678
Traffic to location: ~20 mins from Woodlands"

1:35 PM - Resume Work
Ken: "back"
Bot: "Welcome back! Ready for Ms. Rachel's inspection?
Type 'start job 2' when you arrive at Admiralty Link."

2:05 PM - Different Property Type
Ken: "start job 2"
Bot: "Creating new inspection thread for Ms. Rachel...
Property type: Condominium
Special areas available:
[1] Living & Dining
[2] Kitchen
[3] Master Bedroom with En-suite
[4] Bedroom 2
[5] Bedroom 3
[6] Common Bathroom
[7] Balcony
[8] DB/Utility Room
Type the number to select an area.
Note: This property includes balcony and built-in wardrobes."
```

## Handling Customer Interaction - Tenant Present

```
2:30 PM - Customer Questions During Inspection
Ken: "Customer asking about report timeline"
Bot: "Standard report delivery is 2-3 business days after inspection completion.
Admin will review and send the report to Ms. Rachel directly.
Would you like me to note any specific customer concerns?"

Ken: "Customer worried about aircon in master bedroom making noise"
Bot: "I'll add this to special attention notes.
Please document the air-con condition thoroughly with:
1. Photos of the unit
2. Video of the noise (if possible)
3. Detailed description
This will be highlighted in the report."
```

## End of Day Summary

```
5:45 PM - Final Job Completed
Ken: "complete last job"
Bot: "Great work today, Ken! Daily Summary:

✅ Job 1: Mr. Tan - Woodlands HDB
   Duration: 1h 50min | Photos: 47 | Critical Issues: 1

✅ Job 2: Ms. Rachel - Admiralty Condo
   Duration: 2h 15min | Photos: 62 | All OK

✅ Job 3: Mr. Lim - Sembawang HDB
   Duration: 1h 30min | Photos: 38 | Minor Issues: 3

Total: 3 inspections completed
Total photos: 147
Total time: 5h 35min

Tomorrow you have 4 inspections scheduled.
First job at 9:30 AM - Ang Mo Kio
Have a good evening! 🙏"
```

## Special Scenarios

### No-Show Customer - Jurong West

```
10:15 AM - At Location
Ken: "At Blk 789 Jurong West but nobody home"
Bot: "I see you're at the scheduled location.
How long have you been waiting?"
Ken: "15 minutes already, tried calling 3 times"
Bot: "Let's handle this:
[1] Wait another 10 minutes
[2] Leave and reschedule
[3] Check with neighbor
[4] Try customer's alternative contact
Type the number for your preferred option."

Ken: "2"
Bot: "Marking inspection as 'Customer No-Show'.
Please take a photo of the unit door as proof of visit.
Admin will be notified to reschedule.
Shall we proceed to your next job?"
```

### Emergency Exit - Food Poisoning (optional)

```
11:30 AM - Inspector Unwell
Ken: "Cannot continue, not feeling well"
Bot: "I'm sorry to hear that, Ken. Your health comes first.
Current status: Bedroom 2 inspection in progress
Options:
[1] Mark job as incomplete - resume later
[2] Mark job as incomplete - assign to another inspector
[3] Try to complete critical areas only
Type the number for your preferred option."

Ken: "2"
Bot: "Understood. Marking current job as 'Inspector Emergency - Reassignment Needed'
Completed areas have been saved.
Admin notified for immediate reassignment.
Please take care and rest well. 🙏"
```

### Language Support - Elderly Chinese Resident (optional)

```
2:20 PM - Communication Barrier
Ken: "Uncle only speak Chinese, cannot understand the issues"
Bot: "Here are common terms in Chinese for reference:
- Leaking - 漏水 (lòu shuǐ)
- Electrical - 电气 (diàn qì)
- Window - 窗户 (chuāng hu)
- Door - 门 (mén)
- Toilet - 厕所 (cè suǒ)
- Kitchen - 厨房 (chú fáng)

Would you like me to generate a simple Chinese message to show the uncle?" (options)

Ken: "yes"
Bot: "Show this to the resident:
'我是来做房屋检查的。需要查看所有房间。大概需要1-2小时。谢谢您的配合。'
(I'm here for property inspection. Need to check all rooms. Will take about 1-2 hours. Thank you for your cooperation.)"
```
