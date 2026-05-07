# Security Specification for IBarka Travel

## 1. Data Invariants

1. **User Identity**: Users can only read and write their own profile logic, except for admins. Staff roles (agent) are managed by admins.
2. **Trip Integrity**: Any user can read trips (list), but only company staff (agents/admins) can create or modify them.
3. **Ticket Ownership**: A ticket must belong to the user who purchased it. Only the owner can read their ticket, and agents can read/update it for validation.
4. **Payment Verification**: Transactions are system-managed or derived from authenticated user actions.
5. **Seat Conflicts**: A ticket cannot be created for a seat that is already reserved in the `Trip` document. (Enforced via batch/transaction logic in app, and verified via `exists` in rules if possible).

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Attempt to create a user profile with `uid` of another user.
2. **Role Escalation**: A passenger trying to update their role to `admin`.
3. **Ghost Agent**: A passenger trying to set a `matricule` to appear as staff.
4. **Illicit Ticket Access**: User A trying to read User B's ticket.
5. **Unauthorized Trip Creation**: A passenger trying to create a `Trip`.
6. **Price Tampering**: A passenger trying to set a ticket price to `0`.
7. **Ticket Forgery**: Creating a ticket for a non-existent trip.
8. **Double Reservation**: Creating a ticket for a seat already taken (logical check).
9. **Status Hijack**: A passenger trying to mark their ticket as `used` without agent validation.
10. **Transaction Injection**: Manually creating a `completed` transaction without a real payment reference.
11. **Malicious ID**: Using a very long string as a `tripId` to cause resource exhaustion.
12. **Insecure List**: Querying all tickets in the system without filtering by `userId`.

## 3. Test Runner (Draft)

Testing will be implemented in `firestore.rules.test.ts` to ensure these payloads are denied.
