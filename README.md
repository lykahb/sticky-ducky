# Sticky Ducky

*A browser extension that cleans pages of the sticky elements and shows them when needed. Fast and simple* 

Many websites have sticky headers, social buttons and other things which are always on the screen. Sometimes they are useful,
but most of the time it's junk that simply occupies the screen space. Sticky Ducky automatically cleans the page of the sticky
elements and shows them again when you need it. You can show them on hover or on scroll.

Sticky Ducky examines the document and CSS to find the stickies. Then it injects a stylesheet with the rules that precisely target
the stickies to clean them up. Keeping DOM unaltered keeps the extension well separated from the page DOM logic in Javascript.
Even on the most dynamic websites using React or Vue this approach works reliably.

There is experimental support for the mobile devices with Firefox.

## Inspiration
As more websites I visit started putting sticky junk on the page, it got annoying. All solutions I found were doing similar things:
removing fixed elements from DOM or setting display to none, searching them with the inline style, required user input to block an element.

I wanted an extension that would never break website layout and do its job automatically. So I created a simple one that
hid the headers on several news websites.
Later that year after https://daringfireball.net/2017/06/medium_dickbars was published on Hacker News, I realized that a
lot of people feel the same way and may want to use it too. So, after several rounds of rewrites and polishing it's ready for release. Enjoy!

## Settings

### Modes of hiding stickies
Some sticky elements like navigation may be useful to display. Sticky Ducky lets you do it quickly.
* When hovering over. This requires a pointer and is not recommended on the touch screen devices.
* After scrolling up. This works on mobile devices too.
* On top of the page. This settings is the least likely to show the stickies when not needed. 
* Always. This is similar to disabling extension. 

### Whitelist
You can whitelist the sticky elements on the websites or individual pages. 
The whitelist rules support a limited subset of [Adblock Plus filters format](https://adblockplus.org/filter-cheatsheet).
Notably, the wildcards are currently not supported.

* You can whitelist by an address part: `/checkout` or `.jira.` will whitelist the stickies on any domain if the URL has that pattern.
* By domain name: `||corp.com` whitelists everything on `https://corp.com/index.html` and `https://mail.corp.com/index.html`
* By the exact address `|https://bugtracker.corp.com/secure/|`

All URL patterns can be combined with the individual selectors:
For example, with the entry `||bugtracker.corp.com###header` Sticky Ducky would ignore the header on every page of the bugtracker.corp.com but treat the other stickies as usual.
Selectors must be simple: `.class` or `#id` is okay but `div.class` is not. The selectors are passed inside of `:not` that has tight constraints.

## Installation

[Chrome Store](https://chrome.google.com/webstore/detail/sticky-ducky/gklhneccajklhledmencldobkjjpnhkd)

[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/sticky-ducky/)

## FAQ
### How does Sticky Ducky work?:
1. It analyzes style sheets to discover rules that make elements fixed or sticky.
2. Then it uses selectors from them to find the sticky elements in the page DOM.
3. For each element that may be sticky, apply heuristics to classify its type (header, footer, etc.) and decide if it should be hidden and under what conditions.

### There are still some sticky elements on a page
Likely, Sticky Ducky has detected that element but its heuristics decided not to hide it. You can use developer tools to see if it found it - the detected elements would have an extra attribute `sticky-ducky-type`.

### Why not hide all sticky elements?
Cleaning up sticky elements too eagerly can break websites. Even worse, it would not be obvious that the extension has caused it and the site needs to be whitelisted. So the heuristics make cautious choices.
Here are a few examples:
- On Twitter (and many other sites) opening a picture full-screen brings up a gallery view and disables scroll on the page. The gallery itself is sticky. So hiding it would create an impression that the page froze and does not respond.
- On Github on PR files view the bars with file names are sticky. Ideally, we want to show them when they are on the screen and hide when they are scrolled away. However, the browser API makes it difficult to distinguish those cases. So there is only a choice between hiding them in any position or doing nothing.
