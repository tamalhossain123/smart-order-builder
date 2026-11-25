# DECISIONS

## D1. Two browser tabs share one server. Tab A is editing an item when tab B takes the last eggs. What does tab A see when it saves, and does the user lose anything they typed?
When tab A saves, my server treats the edit as one atomic swap: it checks the new configuration against the current stock, with tab A's own existing reservation counted as available, and only then replaces the reservation. Because tab B already took the last eggs, that check fails and tab A sees the exact shortage message, for example "Short: 2 egg", instead of a silent success. The old reservation stays untouched, so the item is still in the cart exactly as it was before the edit. The user does not lose anything they typed either, because a failed save only shows the error message and leaves the builder configuration on screen as it is. They can remove an ingredient and save again, or cancel the edit and keep the original item.

## D2. Promotions change while an item sits in the cart (the coupon stops at 11:00). Decide when a price is locked: at Add to cart, at checkout, or never. Your choice must stay consistent with TC-06/TC-07.
I lock the price at checkout, never earlier. The cart preview is only an estimate, and every price is calculated again by the pricing engine when the user pays, using the server time at that moment. That is exactly what TC-06 and TC-07 show: the same cart of B x1 + C x2 gets the MORNING15 discount at 10:59:59 and loses it at 11:00:00, falling back to the C1 discount. If I had locked prices at Add to Cart, those two test cases could not both be true for the same cart. Once checkout succeeds, the order stores the final subtotal, discount, VAT and total, and those stored numbers never change afterwards.

## D3. A reservation expires while the user is in the middle of editing that item. Decide what happens to their unsaved changes and what the screen tells them.
The reservation is gone, so the item can no longer be saved or checked out, and my server answers the save attempt with a "Reservation expired" error. On screen the cart item is marked expired and becomes read-only: it can only be removed, and a banner tells the user the reservation expired. I do not silently throw the user's editing work away, because the builder form is persisted in the browser, so the configuration they were editing is still there after the error. They can add it to the cart again as a fresh item if the stock is still available, which creates a new five-minute reservation. What I never do is pretend the old reservation still exists, because the freed stock may already belong to someone else.

## D4. Who creates the order id and timestamp, the browser or the server, and how do you stop a double-click on Pay from creating two orders?
The server creates both. When checkout succeeds, my server code generates the order id and stamps the order with the server clock, which is also the clock used for coupon validity and reservation expiry, so all the rules agree with each other. The browser never invents an id or a time, because a browser clock can be wrong and two browsers could pick the same id. For the double-click problem, the browser generates one idempotency key per pay intent and reuses that same key for every repeat click or retry of that payment. The server stores the key together with the order it created, so a second request with the same key returns the existing order as a duplicate instead of creating a new one. Only after a successful payment does the client generate a fresh key for the next order.

## D5. Someone asks "Who is our best customer?" but orders store no customer. Decide what the bot replies and how you stop it from inventing a name.
My bot replies honestly that it cannot answer that, because the orders contain no customer information at all, only items, payment methods and times. I stop it from inventing a name in three ways. First, the system instruction tells the model to answer only from the tools and to say plainly when the data cannot answer a question. Second, the model never receives the raw orders, so there is no name anywhere in its context that it could pick up and repeat. Third, there is simply no customer tool: every function I expose returns numbers or order ids computed by my statistics functions, so a customer name cannot come back from any tool call. If the model still tried to state a name, it would be contradicting its instructions with no data behind it.

## D6. Design the JSON shape of a stored order yourself. Which fields, which money unit, and how do you record a coupon that was entered but not applied? Document the shape in DECISIONS.md.
I store one order as a single JSON object, and all money is integer poisha everywhere, so no float ever touches a stored price. The shape my code uses is:

```json
{
  "orderId": "ORD-1006",
  "createdAt": 1795331400000,
  "paymentMethod": "card",
  "couponCode": "MORNING15",
  "discountCode": null,
  "lines": [
    { "config": { "bread": { "croissant": 1 }, "eggs": { "omelette": 2, "fried": 2 } },
      "qty": 1, "unitSubtotal": 75500, "lineTotal": 67950 }
  ],
  "subtotal": 116950,
  "discount": 0,
  "vat": 5848,
  "total": 122800
}
```

`createdAt` is a Unix millisecond timestamp created by the server. Each line keeps the full grouped configuration, the quantity, the raw unit subtotal and the final line total after the per-line promotions, so any order can be re-checked later. A coupon that was entered but not applied is recorded with the two separate fields shown above: `couponCode` keeps what the customer entered ("MORNING15"), while `discountCode` records which cart discount was actually applied ("C1", "C2", or null). So ORD-1006 honestly shows the coupon was entered and rejected, instead of pretending it was never there or that it worked.

## C1. Before writing priceCart: explain why storing 679.50 as a JavaScript float is risky for TC-06, and show by hand how the VAT of 75.48 in TC-06 is rounded.
A JavaScript number is a binary float, and most decimal fractions cannot be stored exactly in binary, so 679.50 and values built from it can quietly become something like 679.4999999 inside a calculation. TC-06 is risky because its VAT lands exactly on a half-poisha boundary, where even a tiny float error flips the rounding the wrong way and gives 75.47 instead of 75.48. Working by hand in poisha: the TC-06 subtotal is 165,950 poisha and the winning discount is 15,000, so the discounted subtotal is 150,950 poisha. VAT is 5 percent of that: 150,950 x 5 = 754,750, divided by 100 gives 7,547.5 poisha. I round half-up, so 7,547.5 becomes 7,548 poisha, which is exactly **75.48 BDT**. That is why my engine keeps every amount as an integer number of poisha and only formats BDT at the edge.

## C2. Before wiring Gemini: list every question your bot supports and the exact function (name, inputs, output) that answers it.
My bot supports seven questions, and each one is answered by exactly one function that my own code computes; the model only chooses the function and phrases the result.

- "How many orders are there?" - `getOrderCount()` with no inputs, output `{ orderCount }`.
- "What is the total revenue?" - `getTotalRevenue()` with no inputs, output `{ totalRevenueBDT }`.
- "What is the best-selling option?" - `getBestSellingOption()` with no inputs, output `{ option, unitsSold }`.
- "How much revenue came from each payment method?" - `getRevenueByPaymentMethod()` with no inputs, output `{ revenueByPaymentMethodBDT }`.
- "What is the average order value?" - `getAverageOrderValue()` with no inputs, output `{ averageOrderValueBDT }`.
- "Which orders received the MORNING15 discount?" - `getCouponOrders()` with no inputs, output `{ count, orderIds }`.
- "How many orders were placed on a given date, and how much did they earn?" - `getOrdersOnDate(date)` with input `date` as a "YYYY-MM-DD" string in Asia/Dhaka, output `{ date, count, revenueBDT }`.

Any question outside this list, such as who the best customer is, has no function, and the bot must say it cannot answer from the order data.
