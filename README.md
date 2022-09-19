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

## Support development

If you'd like to support this project, please send examples of websites with unusual stickies, pull requests, issues, or donate to

[Patreon](https://www.patreon.com/lykahb)

Bitcoin 1NGxD7QgSYgWmuFSi7yKbWMGH4f9cA1dTK
