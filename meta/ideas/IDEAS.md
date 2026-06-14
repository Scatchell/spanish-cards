# Explain quick chat option

After the initial explain is generated (or recalled from a previous generation) the user should be able to ask specific questions to the LLM within the context of that sentence. The full translation from explain with all details should automatically be in the context, and it should answer quickly and concisely with a character limit to avoid flooding the modal with too much content. These follow ups would not be saved and should be one shot (e.g. no long running conversation necessary). An example of the usage: for asking questions like "Why is Fui used here instead of estaba?" or "Would another viable translation be <blank>" etc.


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
