# ANSWERS

Every answer below was produced by running this project's own code, not by hand:
`npm run answers` (runs `src/__tests__/answers.test.ts`, which calls the real
`validate` / `priceLine` / `priceCart` / stats functions and the real seed loader,
prints each value, and asserts it). Item definitions (Section 9, official
Appendix A ids): **A** = Toast, Scrambled x2, Chicken Sausage, Ketchup;
**B** = Croissant, Omelette x2, Fried x2, Chicken Sausage, Beef Bacon, Hash Brown,
Mushroom, Hollandaise; **C** = Paratha, Fried x2, Tofu, Cheese x2, Baked Beans,
Mushroom, Chili. Their unit prices from the engine (TC-05): A = 380.00
(250.00 base + 70.00 scrambled + 60.00 sausage), B = 679.50 (755.00 raw, then the
P1 combo takes 10% off because it has 6 eggs and 2 protein), C = 490.00
(515.00 raw, then P2 makes the cheapest extra, beans at 25.00, free).

## Q1. Starting from an empty cart, what is the maximum number of item C you can add? Which ingredient limits it?
**2, limited by cheese.** One C uses: paratha 1, egg 2, tofu 1, cheese 2, beans 1,
mushroom 1 (chili has no stock). Dividing the stock by the per-item use gives
paratha 10, egg 5, tofu 5, cheese 4 / 2 = **2**, beans 8, mushroom 6. Cheese runs
out first, so at most 2 of item C fit in an empty cart.

## Q2. What is the cheapest valid configuration and its unit price?
**Toast + Fried x2 + Tofu = 360.00 BDT** (250.00 base + 0.00 toast + 60.00 fried
+ 50.00 tofu). I found it by searching every bread x eggs x protein combination
with the real rules validator and pricing engine. Extras and sauces cannot make
anything cheaper: every extra has a positive price and the P2 deal only refunds
the cheapest one, and the cheapest sauce (ketchup) is free, so the winner needs
no extras and no paid sauce. The configuration is valid: bread 1, eggs 2 (the
step-2 minimum), protein 1.

## Q3. Cart = A x3, server time 10:30. Give subtotal, chosen discount, VAT and payable. Then the same at 11:30.
**Assumption: the coupon MORNING15 is entered.** Step by step:

At 10:30:
1. One A costs 380.00 and A has no extras and only 2 eggs, so neither P2 nor P1
   applies. Subtotal = 380.00 x 3 = **1,140.00 BDT** (114,000 poisha).
2. C1 needs a subtotal of at least 1,200.00, so C1 = 0. C2 is valid because
   10:30 is strictly before 11:00: 15% of 1,140.00 = 171.00, capped at 150.00.
   Chosen discount = **C2 = 150.00**. Discounted subtotal = 990.00.
3. VAT 5% of 990.00 = **49.50**. Total before final rounding = 1,039.50, rounded
   half-up to whole BDT = **payable 1,040**.

At 11:30:
1. Subtotal is the same **1,140.00**.
2. MORNING15 is no longer valid (it stops at 11:00), and 1,140.00 is below C1's
   1,200.00 threshold, so the chosen discount is **none = 0.00**.
3. VAT 5% of 1,140.00 = **57.00**. Payable = 1,140.00 + 57.00 = **1,197**.

No-coupon figures (for comparison): with no coupon entered the result is the
same at both times: subtotal 1,140.00, discount 0.00, VAT 57.00, payable 1,197.

## Q4. After TC-10, what is the payable at 11:30?
After TC-10 the cart holds the edited B (hash brown removed during the edit, so
B = 643.50: 715.00 raw with the P1 combo 10% off) plus C x2 = 980.00, giving a
subtotal of **1,623.50**. At 11:30 MORNING15 is invalid, so C1 applies instead:
discount **100.00**, discounted subtotal 1,523.50, VAT 5% = 76.175 rounded
half-up to **76.18**, and the payable is 1,599.68 rounded half-up to **1,600 BDT**.

## Q5. The payable of each seed order, and the total revenue of all six.
Each seed order was priced by my own pricing engine using that order's own
`couponCode` and its `createdAt` in Asia/Dhaka:

| Order | Subtotal | Discount | VAT | Payable (BDT) |
|---|---|---|---|---|
| ORD-1001 | 380.00 | C2 57.00 | 16.15 | **339** |
| ORD-1002 | 679.50 | 0.00 | 33.98 | **713** |
| ORD-1003 | 1,360.00 | C2 150.00 | 60.50 | **1,271** |
| ORD-1004 | 550.00 | 0.00 | 27.50 | **578** |
| ORD-1005 | 970.00 | C2 145.50 | 41.23 | **866** |
| ORD-1006 | 1,169.50 | 0.00 | 58.48 | **1,228** |

**Total revenue of all six orders = 4,995 BDT.**

## Q6. The best-selling option across the seed orders, counted in units (line quantity x option quantity).
**Fried Egg (`fried`), 10 units.** It appears as fried x2 in ORD-1002 (x1 line),
ORD-1003 (x2 line = 4 units), ORD-1006 (x1 line and x1 line = 4 units), which
adds up to 2 + 4 + 4 = 10 units, more than any other option.

## Q7. Which payment method brought in the most revenue in the seed orders?
**Card, 2,145 BDT** (ORD-1001 339 + ORD-1004 578 + ORD-1006 1,228). The full
split from the stats function: card 2,145, bkash 1,579 (713 + 866), cash 1,271.

## Q8. How many seed orders actually received the MORNING15 discount? Explain every order that has the code but did not get the discount.
**3 orders received it: ORD-1001, ORD-1003 and ORD-1005.** Step by step:

1. Four orders carry the code: ORD-1001 (created 09:15), ORD-1003 (10:05),
   ORD-1005 (08:50) and ORD-1006 (13:10), all Asia/Dhaka times from the seed file.
2. MORNING15 (discount C2) is only valid strictly before 11:00. The first three
   were all created before 11:00, and in each of them C2 beat C1 (57.00, 150.00
   capped, and 145.50 against C1's 0, 100 and 0), so all three show discount
   code C2 in the priced orders.
3. ORD-1006 is the only order that has the code but did not get the discount:
   it was created at **13:10**, after the 11:00 cutoff, so the coupon was
   rejected. Its subtotal (1,169.50) is also below C1's 1,200.00 threshold, so
   it received no cart discount at all. The order still records
   `couponCode: "MORNING15"` (entered) with `discountCode: null` (not applied).
