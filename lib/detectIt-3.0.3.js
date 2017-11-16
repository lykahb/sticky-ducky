(function(f) {
    if (typeof exports === "object" && typeof module !== "undefined") {
        module.exports = f()
    } else if (typeof define === "function" && define.amd) {
        define([], f)
    } else {
        var g;
        if (typeof window !== "undefined") {
            g = window
        } else if (typeof global !== "undefined") {
            g = global
        } else if (typeof self !== "undefined") {
            g = self
        } else {
            g = this
        }
        g.DetectIt = f()
    }
})(function() {
    var define, module, exports;
    return (function e(t, n, r) {
        function s(o, u) {
            if (!n[o]) {
                if (!t[o]) {
                    var a = typeof require == "function" && require;
                    if (!u && a) return a(o, !0);
                    if (i) return i(o, !0);
                    var f = new Error("Cannot find module '" + o + "'");
                    throw f.code = "MODULE_NOT_FOUND", f
                }
                var l = n[o] = {exports: {}};
                t[o][0].call(l.exports, function(e) {
                    var n = t[o][1][e];
                    return s(n ? n : e)
                }, l, l.exports, e, t, n, r)
            }
            return n[o].exports
        }

        var i = typeof require == "function" && require;
        for (var o = 0; o < r.length; o++) s(r[o]);
        return s
    })({
        1: [function(_dereq_, module, exports) {
            module.exports = _dereq_('detect-it').default;

        }, {"detect-it": 3}],
        2: [function(_dereq_, module, exports) {
            'use strict';

            Object.defineProperty(exports, "__esModule", {
                value: true
            });
            var detectHover = {
                update: function update() {
                    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
                        detectHover.hover = window.matchMedia('(hover: hover)').matches;
                        detectHover.none = window.matchMedia('(hover: none)').matches || window.matchMedia('(hover: on-demand)').matches;
                        detectHover.anyHover = window.matchMedia('(any-hover: hover)').matches;
                        detectHover.anyNone = window.matchMedia('(any-hover: none)').matches || window.matchMedia('(any-hover: on-demand)').matches;
                    }
                }
            };

            detectHover.update();
            exports.default = detectHover;
        }, {}],
        3: [function(_dereq_, module, exports) {
            'use strict';

            Object.defineProperty(exports, "__esModule", {
                value: true
            });

            var _detectHover = _dereq_('detect-hover');

            var _detectHover2 = _interopRequireDefault(_detectHover);

            var _detectPointer = _dereq_('detect-pointer');

            var _detectPointer2 = _interopRequireDefault(_detectPointer);

            var _detectTouchEvents = _dereq_('detect-touch-events');

            var _detectTouchEvents2 = _interopRequireDefault(_detectTouchEvents);

            var _detectPassiveEvents = _dereq_('detect-passive-events');

            var _detectPassiveEvents2 = _interopRequireDefault(_detectPassiveEvents);

            function _interopRequireDefault(obj) {
                return obj && obj.__esModule ? obj : {default: obj};
            }

            /*
             * detectIt object structure
             * const detectIt = {
             *   deviceType: 'mouseOnly' / 'touchOnly' / 'hybrid',
             *   passiveEvents: boolean,
             *   hasTouch: boolean,
             *   hasMouse: boolean,
             *   maxTouchPoints: number,
             *   primaryHover: 'hover' / 'none',
             *   primaryPointer: 'fine' / 'coarse' / 'none',
             *   state: {
             *     detectHover,
             *     detectPointer,
             *     detectTouchEvents,
             *     detectPassiveEvents,
             *   },
             *   update() {...},
             * }
             */

            function determineDeviceType(hasTouch, anyHover, anyFine, state) {
                // A hybrid device is one that both hasTouch and any input device can hover
                // or has a fine pointer.
                if (hasTouch && (anyHover || anyFine)) return 'hybrid';

                // workaround for browsers that have the touch events api,
                // and have implemented Level 4 media queries but not the
                // hover and pointer media queries, so the tests are all false (notable Firefox)
                // if it hasTouch, no pointer and hover support, and on an android assume it's touchOnly
                // if it hasTouch, no pointer and hover support, and not on an android assume it's a hybrid
                if (hasTouch && Object.keys(state.detectHover).filter(function(key) {
                        return key !== 'update';
                    }).every(function(key) {
                        return state.detectHover[key] === false;
                    }) && Object.keys(state.detectPointer).filter(function(key) {
                        return key !== 'update';
                    }).every(function(key) {
                        return state.detectPointer[key] === false;
                    })) {
                    if (window.navigator && /android/.test(window.navigator.userAgent.toLowerCase())) {
                        return 'touchOnly';
                    }
                    return 'hybrid';
                }

                // In almost all cases a device that doesn’t support touch will have a mouse,
                // but there may be rare exceptions. Note that it doesn’t work to do additional tests
                // based on hover and pointer media queries as older browsers don’t support these.
                // Essentially, 'mouseOnly' is the default.
                return hasTouch ? 'touchOnly' : 'mouseOnly';
            }

            var detectIt = {
                state: {
                    detectHover: _detectHover2.default,
                    detectPointer: _detectPointer2.default,
                    detectTouchEvents: _detectTouchEvents2.default,
                    detectPassiveEvents: _detectPassiveEvents2.default
                },
                update: function update() {
                    detectIt.state.detectHover.update();
                    detectIt.state.detectPointer.update();
                    detectIt.state.detectTouchEvents.update();
                    detectIt.state.detectPassiveEvents.update();
                    detectIt.updateOnlyOwnProperties();
                },
                updateOnlyOwnProperties: function updateOnlyOwnProperties() {
                    if (typeof window !== 'undefined') {
                        detectIt.passiveEvents = detectIt.state.detectPassiveEvents.hasSupport || false;

                        detectIt.hasTouch = detectIt.state.detectTouchEvents.hasSupport || false;

                        detectIt.deviceType = determineDeviceType(detectIt.hasTouch, detectIt.state.detectHover.anyHover, detectIt.state.detectPointer.anyFine, detectIt.state);

                        detectIt.hasMouse = detectIt.deviceType !== 'touchOnly';

                        detectIt.primaryInput = detectIt.deviceType === 'mouseOnly' && 'mouse' || detectIt.deviceType === 'touchOnly' && 'touch' ||
                            // deviceType is hybrid:
                            detectIt.state.detectHover.hover && 'mouse' || detectIt.state.detectHover.none && 'touch' ||
                            // if there's no support for hover media queries but detectIt determined it's
                            // a hybrid  device, then assume it's a mouse first device
                            'mouse';

                        // issue with Windows Chrome on hybrid devices starting in version 59 where
                        // media queries represent a touch only device, so if the browser is an
                        // affected Windows Chrome version and hasTouch,
                        // then assume it's a hybrid with primaryInput mouse
                        // see https://github.com/rafrex/detect-it/issues/8
                        var isAffectedWindowsChromeVersion = /windows/.test(window.navigator.userAgent.toLowerCase()) && /chrome/.test(window.navigator.userAgent.toLowerCase()) && parseInt(/Chrome\/([0-9.]+)/.exec(navigator.userAgent)[1], 10) >= 59;

                        if (isAffectedWindowsChromeVersion && detectIt.hasTouch) {
                            detectIt.deviceType = 'hybrid';
                            detectIt.hasMouse = true;
                            detectIt.primaryInput = 'mouse';
                        }
                    }
                }
            };

            detectIt.updateOnlyOwnProperties();
            exports.default = detectIt;
        }, {"detect-hover": 2, "detect-passive-events": 4, "detect-pointer": 5, "detect-touch-events": 6}],
        4: [function(_dereq_, module, exports) {
            'use strict';

            Object.defineProperty(exports, "__esModule", {
                value: true
            });
// adapted from https://github.com/WICG/EventListenerOptions/blob/gh-pages/explainer.md
            var detectPassiveEvents = {
                update: function update() {
                    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                        var passive = false;
                        var options = Object.defineProperty({}, 'passive', {
                            get: function get() {
                                passive = true;
                            }
                        });
                        // note: have to set and remove a no-op listener instead of null
                        // (which was used previously), becasue Edge v15 throws an error
                        // when providing a null callback.
                        // https://github.com/rafrex/detect-passive-events/pull/3
                        var noop = function noop() {
                        };
                        window.addEventListener('testPassiveEventSupport', noop, options);
                        window.removeEventListener('testPassiveEventSupport', noop, options);
                        detectPassiveEvents.hasSupport = passive;
                    }
                }
            };

            detectPassiveEvents.update();
            exports.default = detectPassiveEvents;
        }, {}],
        5: [function(_dereq_, module, exports) {
            'use strict';

            Object.defineProperty(exports, "__esModule", {
                value: true
            });
            var detectPointer = {
                update: function update() {
                    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
                        detectPointer.fine = window.matchMedia('(pointer: fine)').matches;
                        detectPointer.coarse = window.matchMedia('(pointer: coarse)').matches;
                        detectPointer.none = window.matchMedia('(pointer: none)').matches;
                        detectPointer.anyFine = window.matchMedia('(any-pointer: fine)').matches;
                        detectPointer.anyCoarse = window.matchMedia('(any-pointer: coarse)').matches;
                        detectPointer.anyNone = window.matchMedia('(any-pointer: none)').matches;
                    }
                }
            };

            detectPointer.update();
            exports.default = detectPointer;
        }, {}],
        6: [function(_dereq_, module, exports) {
            'use strict';

            Object.defineProperty(exports, "__esModule", {
                value: true
            });
            var detectTouchEvents = {
                update: function update() {
                    if (typeof window !== 'undefined') {
                        detectTouchEvents.hasSupport = 'ontouchstart' in window;
                        detectTouchEvents.browserSupportsApi = Boolean(window.TouchEvent);
                    }
                }
            };

            detectTouchEvents.update();
            exports.default = detectTouchEvents;
        }, {}]
    }, {}, [1])(1)
});