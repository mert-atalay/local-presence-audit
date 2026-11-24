# Local presence audit

Generated 2026-11-01 by local-presence-audit 0.1.0.

This is demo output. The businesses are invented and no live data was requested.

## Summary

Lowest score first.

| Location | Score | Status | First fix |
| --- | --- | --- | --- |
| Tidewater Bike Repair | 23/100 | fail | Add a phone number to the listing. |
| Corner Loaf Bakery | 64/100 | warn | The phone differs between the listing ("+1 604-555-0117") and the website ("(604) 555-0199"). Make them the same. |
| Brightside Dental Studio | 96/100 | pass | None |

## Tidewater Bike Repair

**Overall: 23/100 (fail)**

- Address: 77 Quay Road, Maple Hollow, BC V0X 1A6, Canada
- Place id: `DEMO_tidewater_bikes`
- Google Maps: https://maps.google.com/?cid=1000000000000000003

### Fix list

1. **high**: Add a phone number to the listing.
2. **high**: Add a website link to the listing.
3. **high**: Add regular opening hours to the listing.
4. **high**: The average rating is 3.9. Read the low ratings, reply to them and fix the complaints that repeat.
5. **medium**: Add photos of the exterior, interior and products or team. The listing shows 1.
6. **medium**: Only 6 ratings. Build a routine of asking customers for a review after a visit. Do not offer incentives.
7. **medium**: Nearby listings of the same type have more reviews (rank 3 of 4). Review count is the gap to close.
8. **medium**: No review newer than 517 days in the sample. Check the listing, and if that holds, ask recent customers for reviews.

### Checks

#### Listing completeness: 17/100 (fail)

17 of 100 completeness points.

- Phone number: missing
- Website: missing
- Opening hours: missing
- Primary category: present
- Photos: 1
- Editorial summary: none (Google writes this, the owner cannot add it directly)
- Business status: OPERATIONAL

#### Rating and review volume: 46/100 (fail)

3.9 stars from 6 ratings.

- Rating part: 53/100 (60% of this check)
- Volume part: 37/100 (40% of this check)

#### Review recency: 10/100 (fail)

The newest review in the sample is 517 days old.

- Based on a sample of 2 reviews. The API returns at most 5, picked by relevance, so a newer review may exist.

#### Hours sanity: 0/100 (fail)

No regular opening hours on the listing.

#### Website consistency: n/a (skipped)

The listing has no website, so there is nothing to compare.

#### Competitor comparison: 33/100 (fail)

Ranks 3 of 4 on rating and 3 of 4 on review count among nearby listings of the same type.

- Compared with the 3 nearest "bicycle_store" listings within 2000 m.
- Rating rank: 3 of 4
- Review count rank: 3 of 4
- Hollow Cycle Works: 4.7 stars, 188 ratings, 191 m away
- Harbour Wheels: no rating, 0 ratings, 441 m away
- Spoke and Chain: 4.4 stars, 64 ratings, 686 m away

## Corner Loaf Bakery

**Overall: 64/100 (warn)**

- Address: 9 Mill Lane, Maple Hollow, BC V0X 1A3, Canada
- Place id: `DEMO_corner_loaf`
- Google Maps: https://maps.google.com/?cid=1000000000000000002
- Website: https://cornerloaf.example/

### Fix list

1. **high**: The phone differs between the listing ("+1 604-555-0117") and the website ("(604) 555-0199"). Make them the same.
2. **medium**: Add photos of the exterior, interior and products or team. The listing shows 4.
3. **medium**: Check the Sunday hours. A 30 minute opening looks like a typing error.
4. **medium**: The listing shows the business closed 3 days a week. Confirm no days are missing.
5. **medium**: Nearby listings of the same type have more reviews (rank 4 of 5). Review count is the gap to close.
6. **medium**: No review newer than 264 days in the sample. Check the listing, and if that holds, ask recent customers for reviews.

### Checks

#### Listing completeness: 83/100 (pass)

83 of 100 completeness points.

- Phone number: present
- Website: present
- Opening hours: present
- Primary category: present
- Photos: 4
- Editorial summary: none (Google writes this, the owner cannot add it directly)
- Business status: OPERATIONAL

#### Rating and review volume: 74/100 (warn)

4.3 stars from 38 ratings.

- Rating part: 76/100 (60% of this check)
- Volume part: 69/100 (40% of this check)

#### Review recency: 30/100 (fail)

The newest review in the sample is 264 days old.

- Based on a sample of 4 reviews. The API returns at most 5, picked by relevance, so a newer review may exist.

#### Hours sanity: 75/100 (warn)

Hours listed for 4 of 7 days, with points to check.

- Sunday: open for only 30 minutes (09:00 to 09:30).
- Shown as closed on: Monday, Tuesday, Wednesday.

#### Website consistency: 67/100 (warn)

The site structured data and the listing disagree on: phone.

- Structured data type: Bakery
- Name: match (listing: Corner Loaf Bakery | site: Corner Loaf Bakery & Cafe)
- Address: match (listing: 9 Mill Lane, Maple Hollow, BC V0X 1A3, Canada | site: 9 Mill Ln, Maple Hollow, V0X 1A3)
- Phone: mismatch (listing: +1 604-555-0117 | site: (604) 555-0199)

#### Competitor comparison: 25/100 (fail)

Ranks 4 of 5 on rating and 4 of 5 on review count among nearby listings of the same type.

- Compared with the 4 nearest "bakery" listings within 2000 m.
- Rating rank: 4 of 5
- Review count rank: 4 of 5
- Mill Street Bread Co.: 4.7 stars, 410 ratings, 88 m away
- Hollow Oven: 4.5 stars, 126 ratings, 358 m away
- Daily Crumb: 4.1 stars, 22 ratings, 582 m away
- Sweet Tide Patisserie: 4.6 stars, 77 ratings, 802 m away

## Brightside Dental Studio

**Overall: 96/100 (pass)**

- Address: 214 Alder Street, Maple Hollow, BC V0X 1A1, Canada
- Place id: `DEMO_brightside_dental`
- Google Maps: https://maps.google.com/?cid=1000000000000000001
- Website: https://brightside-dental.example/

### Fix list

Nothing to fix from these checks.

### Checks

#### Listing completeness: 100/100 (pass)

100 of 100 completeness points.

- Phone number: present
- Website: present
- Opening hours: present
- Primary category: present
- Photos: 10 or more (the API returns at most 10)
- Editorial summary: present
- Business status: OPERATIONAL

#### Rating and review volume: 100/100 (pass)

4.8 stars from 212 ratings.

- Rating part: 100/100 (60% of this check)
- Volume part: 100/100 (40% of this check)

#### Review recency: 100/100 (pass)

The newest review in the sample is 11 days old.

- Based on a sample of 5 reviews. The API returns at most 5, picked by relevance, so a newer review may exist.

#### Hours sanity: 100/100 (pass)

Hours listed for 6 of 7 days, nothing unusual.

- Shown as closed on: Sunday.

#### Website consistency: 100/100 (pass)

Name, address and phone in the site structured data agree with the listing.

- Structured data type: Dentist
- Name: match (listing: Brightside Dental Studio | site: Brightside Dental Studio)
- Address: match (listing: 214 Alder Street, Maple Hollow, BC V0X 1A1, Canada | site: 214 Alder St., Maple Hollow, V0X 1A1)
- Phone: match (listing: +1 604-555-0142 | site: +1-604-555-0142)

#### Competitor comparison: 75/100 (warn)

Ranks 2 of 5 on rating and 2 of 5 on review count among nearby listings of the same type.

- Compared with the 4 nearest "dentist" listings within 2000 m.
- Rating rank: 2 of 5
- Review count rank: 2 of 5
- Alder Family Dentistry: 4.6 stars, 340 ratings, 137 m away
- Hollow Smiles Dental: 4.9 stars, 95 ratings, 262 m away
- Maple Hollow Dental Centre: 4.2 stars, 151 ratings, 802 m away
- Quayside Dental: 4.4 stars, 58 ratings, 1030 m away

---

Listing data: invented demo fixtures. Scores are rules of thumb from this tool, not Google ranking factors.
Review recency uses the small sample of reviews the API returns.
