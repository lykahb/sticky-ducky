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

## Installation

[Chrome Store](https://chrome.google.com/webstore/detail/sticky-ducky/gklhneccajklhledmencldobkjjpnhkd)

[Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/sticky-ducky/)

## Support development

If you'd like to support this project, please send examples of websites with unusual stickies, pull requests, issues, or donate to

[Patreon](https://www.patreon.com/lykahb)

Bitcoin 1NGxD7QgSYgWmuFSi7yKbWMGH4f9cA1dTK