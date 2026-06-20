# Start with cards that are scheduled, end with newly added cards
- This can help a user keep up to date with scheduled cards and their memory plan, even if they are consistently adding a lot of new cards

# Re-trainin missed cards in the same session
- This works more or less but feels odd - if I miss 5 words in a session, it doesn't replay them and at the end says training is done. Think I should decide either:
1. Ask the user if they want to review the missed cards at the end
2. Automatically keep reviewing until all are remembered (user can always drop out at anytime) - the numbered card part at the top can change from 16/16 to Reviewing missed cards 3/4 instead to indicate this

# Spanish specific matching
época de el año
Was considered incorrect because the answer was
época del año

Should encode spanish specific rules to account for this (maybe can AI generate them)



# Corrections for each letter
- This is already done, but it crosses out the entire word. Is there a way to show only the highlighted letter that was wrong in the new word if only some characters were incorrect?

Not important but a slight UI enhancement to make it easier to see what happened

# Content-Security-Policy (deferred from the security hardening pass)

We added `helmet()` but with CSP disabled. A Content-Security-Policy is the
strongest XSS mitigation: it tells the browser which origins may load scripts,
styles, images, and connect targets, so injected `<script>` or inline handlers
won't execute. Worth adding once we have time to tune it.

Why it was deferred: a strict CSP is fiddly for a Vite SPA — Vite can emit inline
styles/scripts and hashed asset URLs, so a naive `default-src 'self'` policy tends
to break the bundle until every needed source (self, the API origin, any font/CDN)
is enumerated. Suggested rollout: start in `Content-Security-Policy-Report-Only`
mode, watch the browser console / report endpoint for violations on a real session
(load, login, train, explain), tighten until clean, then switch to enforcing.
Single-user risk is lower, so this is a nice-to-have, not a blocker.

# Refine prompt
- "¿…? = question marks in Spanish go both at the start and end of the question." was explained at one point - this level of basic detail is unnecessary
- Maybe structure the response (in JSON) so it is always word : explanation? - followed by OPTIONAL overall sentence explanations - for example of a good 'overall sentence explanation' I liked this one: "So the literal sense is “We can go slowly,” which matches the natural English idea “We can take it easy. despacio is often used for pacing/tempo, so it fits this relaxed, casual meaning well.” which helped the user to explain the concept well.
