# Explain translations
Use a cheap model like gpt 4o to quickly do a request when user clicks some explain option. Request should say something like (need to refine prompt):

"English: <>, Spanish: <> - explain why the spanish word or phrase means this, word by word, including grammatical components and any language specifics about Spanish that are being applied here."

This should allow the user to get an explanation of *why* a certain translation is what it is, to assist in remembering it.

GPT requests should be well factored into an edge layer, easily replaced by other models. An API call might be enough here for this simple usage. API key can be read from .env file as OPENAI_TOKEN

Ensure that any tests (including e2e tests) don't actually execute GPT-4o calls - instead there should be a cleanly defined interface for the LLM API layer that can be mocked in tests to return a sample response (at no cost, with no API call to any real LLM). This cleanly separated interface should also allow for easy model swapping if necessary (e.g. if an OpenAI client is to be swapped with an Anthropic or even local LLM client)

There should be a data layer that "caches" the explanation - if an explanation was already generated before (word or phrase) then that response should be saved alongside the card, so the next time the button is clicked it is loaded from the DB storage instead of having to make another LLM call.

Craft the prompt so the LLM responds something similar to the following:

Solo me he cortado el pelo allí una vez antes.

Full translation:
“I’ve only had my hair cut there once before.”

Breakdown:

* Solo = “only”
    Limits the action: not many times, just one time.
* me he cortado = “I have had cut / I’ve gotten cut”
    * he cortado is the present perfect: he = “I have,” cortado = “cut.”
    * me makes it reflexive/pronominal: literally “I have cut myself,” but with hair it usually means “I got/had my hair cut”, not that you cut it yourself.
* el pelo = “the hair / my hair”
    Spanish often uses the definite article with body parts: el pelo literally means “the hair,” but in English we usually say “my hair” because the owner is understood from me.
* allí = “there”
    Refers to a specific place away from the speaker, like a salon or barbershop previously mentioned.
* una vez = “one time / once”
    vez means “time” as in an occurrence, so una vez means “once.”
* antes = “before”
    Places that one occurrence earlier than now.

To get the above I used the following prompt, but feel free to tweak and/or refine this:

"Briefly explain each part of this spanish word or phrase. First: Translate the sentence to english in full. Second: Break the sentence into meaningful components, showing translations for each while explaining the component and why the spanish word or phrase means what is in the English translation (including, only if they exist, grammatical components and any language specifics about Spanish that are being applied here in a brief summary - use bullet points, be quick and concise.)

<word/phrase>"
