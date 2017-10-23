# Sticky Ducky

*A browser extension that cleans pages of the sticky elements and shows them when needed. Fast and simple* 

Many websites have sticky headers, social buttons and other things which are always on the screen. Sometimes they are useful, but most of the time it's junk that simply occupies the screen space.
Sticky Ducky automatically cleans the page of the sticky elements and shows them again when you need it. You can show them on hover or on scroll.

Under the hood, it injects a dynamic stylesheet to clean up the stickies. Keeping DOM unaltered rules out several classes of bugs related to persistent cleaning and the page logic reliant on DOM state. That makes it work better with more websites, particularly the ones with React or Vue. 

There is experimental support for the mobile devices.

## Inspiration
As more websites I visit started putting sticky junk on the page, it got annoying. All solutions I found were doing similar things: removing fixed elements from DOM or setting display to none, searching them with the inline style, required user input to block an element.

I wanted an extension that would never break website layout and do its job automatically. So I created a simple one that hid the headers on several news websites.
Later this year after https://daringfireball.net/2017/06/medium_dickbars was published on Hacker News, I realized that a lot of people feel the same way and may want to use it too.
So, after several rounds of rewrites and polishing it's ready for release. Enjoy!

## Installation

https://chrome.google.com/webstore/detail/sticky-ducky/gklhneccajklhledmencldobkjjpnhkd

https://addons.mozilla.org/en-US/firefox/addon/sticky-ducky/
