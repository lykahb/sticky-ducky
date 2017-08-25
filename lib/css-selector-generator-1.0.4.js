var CssSelectorGenerator, root,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

CssSelectorGenerator = (function() {
    CssSelectorGenerator.prototype.default_options = {
        selectors: ['id', 'class', 'tag', 'nthchild'],
        combinationsLimit: 20
    };

    function CssSelectorGenerator(options) {
        if (options == null) {
            options = {};
        }
        this.options = {};
        this.setOptions(this.default_options);
        this.setOptions(options);
    }

    CssSelectorGenerator.prototype.setOptions = function(options) {
        var key, results, val;
        if (options == null) {
            options = {};
        }
        results = [];
        for (key in options) {
            val = options[key];
            if (this.default_options.hasOwnProperty(key)) {
                results.push(this.options[key] = val);
            } else {
                results.push(void 0);
            }
        }
        return results;
    };

    CssSelectorGenerator.prototype.isElement = function(element) {
        return !!((element != null ? element.nodeType : void 0) === 1);
    };

    CssSelectorGenerator.prototype.getParents = function(element) {
        var current_element, result;
        result = [];
        if (this.isElement(element)) {
            current_element = element;
            while (this.isElement(current_element)) {
                result.push(current_element);
                current_element = current_element.parentNode;
            }
        }
        return result;
    };

    CssSelectorGenerator.prototype.getTagSelector = function(element) {
        return this.sanitizeItem(element.tagName.toLowerCase());
    };

    CssSelectorGenerator.prototype.sanitizeItem = function(item) {
        var characters;
        characters = (item.split('')).map(function(character) {
            if (character === ':') {
                return "\\" + (':'.charCodeAt(0).toString(16).toUpperCase()) + " ";
            } else if (/[ !"#$%&'()*+,.\/;<=>?@\[\\\]^`{|}~]/.test(character)) {
                return "\\" + character;
            } else {
                return escape(character).replace(/\%/g, '\\');
            }
        });
        return characters.join('');
    };

    CssSelectorGenerator.prototype.getIdSelector = function(element) {
        var id, sanitized_id;
        id = element.getAttribute('id');
        if ((id != null) && (id !== '') && !(/\s/.exec(id)) && !(/^\d/.exec(id))) {
            sanitized_id = "#" + (this.sanitizeItem(id));
            if (element.ownerDocument.querySelectorAll(sanitized_id).length === 1) {
                return sanitized_id;
            }
        }
        return null;
    };

    CssSelectorGenerator.prototype.getClassSelectors = function(element) {
        var class_string, item, result;
        result = [];
        class_string = element.getAttribute('class');
        if (class_string != null) {
            class_string = class_string.replace(/\s+/g, ' ');
            class_string = class_string.replace(/^\s|\s$/g, '');
            if (class_string !== '') {
                result = (function() {
                    var j, len, ref, results;
                    ref = class_string.split(/\s+/);
                    results = [];
                    for (j = 0, len = ref.length; j < len; j++) {
                        item = ref[j];
                        results.push("." + (this.sanitizeItem(item)));
                    }
                    return results;
                }).call(this);
            }
        }
        return result;
    };

    CssSelectorGenerator.prototype.getAttributeSelectors = function(element) {
        var attribute, blacklist, j, len, ref, ref1, result;
        result = [];
        blacklist = ['id', 'class'];
        ref = element.attributes;
        for (j = 0, len = ref.length; j < len; j++) {
            attribute = ref[j];
            if (ref1 = attribute.nodeName, indexOf.call(blacklist, ref1) < 0) {
                result.push("[" + attribute.nodeName + "=" + attribute.nodeValue + "]");
            }
        }
        return result;
    };

    CssSelectorGenerator.prototype.getNthChildSelector = function(element) {
        var counter, j, len, parent_element, sibling, siblings;
        parent_element = element.parentNode;
        if (parent_element != null) {
            counter = 0;
            siblings = parent_element.childNodes;
            for (j = 0, len = siblings.length; j < len; j++) {
                sibling = siblings[j];
                if (this.isElement(sibling)) {
                    counter++;
                    if (sibling === element) {
                        return ":nth-child(" + counter + ")";
                    }
                }
            }
        }
        return null;
    };

    CssSelectorGenerator.prototype.testSelector = function(element, selector, inDocument) {
        var found_elements, root;
        if ((selector != null) && selector !== '') {
            root = inDocument ? element.ownerDocument : element.parentNode;
            found_elements = root.querySelectorAll(selector);
            return found_elements.length === 1 && found_elements[0] === element;
        }
        return false;
    };

    CssSelectorGenerator.prototype.testCombinations = function(element, items, tag) {
        var test;
        test = (function(_this) {
            return function(combinations) {
                var selector;
                selector = combinations.join('');
                if (tag != null) {
                    selector = tag + selector;
                }
                if (_this.testSelector(element, selector)) {
                    return selector;
                }
            };
        })(this);
        return this.filterCombinations(items, test);
    };

    CssSelectorGenerator.prototype.getUniqueSelector = function(element) {
        var j, len, ref, selector, selector_type, selectors, tag_selector;
        tag_selector = this.getTagSelector(element);
        ref = this.options.selectors;
        for (j = 0, len = ref.length; j < len; j++) {
            selector_type = ref[j];
            switch (selector_type) {
                case 'id':
                    selector = this.getIdSelector(element);
                    break;
                case 'tag':
                    selector = tag_selector && this.testSelector(element, tag_selector);
                    break;
                case 'class':
                    selectors = this.getClassSelectors(element);
                    if ((selectors != null) && selectors.length !== 0) {
                        selector = this.testCombinations(element, selectors, tag_selector);
                    }
                    break;
                case 'attribute':
                    selectors = this.getAttributeSelectors(element);
                    if ((selectors != null) && selectors.length !== 0) {
                        selector = this.testCombinations(element, selectors, tag_selector);
                    }
                    break;
                case 'nthchild':
                    selector = this.getNthChildSelector(element);
            }
            if (selector) {
                return selector;
            }
        }
        return '*';
    };

    CssSelectorGenerator.prototype.getSelector = function(element) {
        var item, j, len, parents, result, selector, selectors;
        selectors = [];
        parents = this.getParents(element);
        for (j = 0, len = parents.length; j < len; j++) {
            item = parents[j];
            selector = this.getUniqueSelector(item);
            if (selector != null) {
                selectors.unshift(selector);
                result = selectors.join(' > ');
                if (this.testSelector(element, result, true)) {
                    return result;
                }
            }
        }
        return null;
    };

    CssSelectorGenerator.prototype.filterCombinations = function(items, test) {
        var advance, counter, indexes, j, length, ref, result, results;
        if (items == null) {
            items = [];
        }
        advance = function(indexes) {
            var i, j, k, maxValue, ref, ref1, ref2, startIndex, startValue;
            for (i = j = ref = indexes.length - 1; ref <= 0 ? j <= 0 : j >= 0; i = ref <= 0 ? ++j : --j) {
                maxValue = items.length - (indexes.length - i);
                if (indexes[i] < maxValue) {
                    startIndex = i;
                    break;
                }
            }
            if (startIndex == null) {
                return false;
            }
            startValue = indexes[startIndex];
            for (i = k = ref1 = startIndex, ref2 = indexes.length - 1; ref1 <= ref2 ? k <= ref2 : k >= ref2; i = ref1 <= ref2 ? ++k : --k) {
                indexes[i] = ++startValue;
            }
            return true;
        };
        counter = 0;
        length = 1;
        while (length <= items.length) {
            indexes = (function() {
                results = [];
                for (var j = 0, ref = length - 1; 0 <= ref ? j <= ref : j >= ref; 0 <= ref ? j++ : j--){ results.push(j); }
                return results;
            }).apply(this);
            while (true) {
                result = test(indexes.map(function(i) {
                    return items[i];
                }));
                counter++;
                if (result || counter >= this.options.combinationsLimit) {
                    return result;
                }
                if (!advance(indexes)) {
                    break;
                }
            }
            length++;
        }
    };

    return CssSelectorGenerator;

})();

if (typeof define !== "undefined" && define !== null ? define.amd : void 0) {
    define([], function() {
        return CssSelectorGenerator;
    });
} else {
    root = typeof exports !== "undefined" && exports !== null ? exports : this;
    root.CssSelectorGenerator = CssSelectorGenerator;
}
