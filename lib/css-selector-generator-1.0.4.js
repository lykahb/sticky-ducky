var CssSelectorGenerator, root,
    indexOf = [].indexOf;

CssSelectorGenerator = (function() {
    class CssSelectorGenerator {
        constructor(options = {}) {
            this.options = {};
            this.setOptions(this.default_options);
            this.setOptions(options);
        }

        setOptions(options = {}) {
            var key, results, val;
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
        }

        isElement(element) {
            return !!((element != null ? element.nodeType : void 0) === 1);
        }

        getParents(element) {
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
        }

        getTagSelector(element) {
            return this.sanitizeItem(element.tagName.toLowerCase());
        }

        // escapes special characters in class and ID selectors
        sanitizeItem(item) {
            var characters;
            characters = (item.split('')).map(function(character) {
                // colon is valid character in an attribute, but has to be escaped before
                // being used in a selector, because it would clash with the CSS syntax
                if (character === ':') {
                    return `\\${':'.charCodeAt(0).toString(16).toUpperCase()} `;
                } else if (/[ !"#$%&'()*+,.\/;<=>?@\[\\\]^`{|}~]/.test(character)) {
                    return `\\${character}`;
                } else {
                    return escape(character).replace(/\%/g, '\\');
                }
            });
            return characters.join('');
        }

        getIdSelector(element) {
            var id, sanitized_id;
            id = element.getAttribute('id');
            // ...exist
            // ID must... exist, not to be empty and not to contain whitespace
            // ...not be empty
            // ...not contain whitespace
            // ...not start with a number
            if ((id != null) && (id !== '') && !(/\s/.exec(id)) && !(/^\d/.exec(id))) {
                sanitized_id = `#${this.sanitizeItem(id)}`;
                // ID must match single element
                if (element.ownerDocument.querySelectorAll(sanitized_id).length === 1) {
                    return sanitized_id;
                }
            }
            return null;
        }

        getClassSelectors(element) {
            var class_string, item, result;
            result = [];
            class_string = element.getAttribute('class');
            if (class_string != null) {
                // remove multiple whitespaces
                class_string = class_string.replace(/\s+/g, ' ');
                // trim whitespace
                class_string = class_string.replace(/^\s|\s$/g, '');
                if (class_string !== '') {
                    result = (function() {
                        var j, len, ref, results;
                        ref = class_string.split(/\s+/);
                        results = [];
                        for (j = 0, len = ref.length; j < len; j++) {
                            item = ref[j];
                            results.push(`.${this.sanitizeItem(item)}`);
                        }
                        return results;
                    }).call(this);
                }
            }
            return result;
        }

        getAttributeSelectors(element) {
            var attribute, blacklist, j, len, ref, ref1, result;
            result = [];
            blacklist = ['id', 'class'];
            ref = element.attributes;
            for (j = 0, len = ref.length; j < len; j++) {
                attribute = ref[j];
                if (ref1 = attribute.nodeName, indexOf.call(blacklist, ref1) < 0) {
                    result.push(`[${attribute.nodeName}=${attribute.nodeValue}]`);
                }
            }
            return result;
        }

        getNthChildSelector(element) {
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
                            return `:nth-child(${counter})`;
                        }
                    }
                }
            }
            return null;
        }

        testSelector(element, selector, inDocument) {
            var found_elements, root;
            if ((selector != null) && selector !== '') {
                root = inDocument ? element.ownerDocument : element.parentNode;
                found_elements = root.querySelectorAll(selector);
                return found_elements.length === 1 && found_elements[0] === element;
            }
            return false;
        }

        // helper function that looks for the first unique combination
        testCombinations(element, items, tag) {
            var test;
            test = (combinations) => {
                var selector;
                selector = combinations.join('');
                if (tag != null) {
                    // if tag selector is enabled, try attaching it
                    selector = tag + selector;
                }
                if (this.testSelector(element, selector)) {
                    return combinations;
                }
            };
            return this.findCombination(items, test);
        }

        getUniqueSelector(element) {
            var combos, id_selector, j, len, ref, selector, selector_type, selectors, tag_selector;
            tag_selector = this.getTagSelector(element);
            ref = this.options.selectors;
            for (j = 0, len = ref.length; j < len; j++) {
                selector_type = ref[j];
                switch (selector_type) {
                    // ID selector (no need to check for uniqueness)
                    case 'id':
                        id_selector = this.getIdSelector(element);
                        if (id_selector) {
                            selector = {
                                'id': id_selector
                            };
                        }
                        break;
                    // tag selector (should return unique for BODY)
                    case 'tag':
                        if (tag_selector && this.testSelector(element, tag_selector)) {
                            selector = {
                                'tag': tag_selector
                            };
                        }
                        break;
                    // class selector
                    case 'class':
                        selectors = this.getClassSelectors(element);
                        if ((selectors != null) && selectors.length !== 0) {
                            combos = this.testCombinations(element, selectors, tag_selector);
                            if (combos) {
                                selector = {
                                    'class': combos,
                                    'tag': tag_selector
                                };
                            }
                        }
                        break;
                    // attribute selector
                    case 'attribute':
                        selectors = this.getAttributeSelectors(element);
                        if ((selectors != null) && selectors.length !== 0) {
                            combos = this.testCombinations(element, selectors, tag_selector);
                            if (combos) {
                                selector = {
                                    'attribute': combos,
                                    'tag': tag_selector
                                };
                            }
                        }
                        break;
                    // if anything else fails, return n-th child selector
                    case 'nthchild':
                        selector = {
                            'nthchild': this.getNthChildSelector(element)
                        };
                }
                if (selector) {
                    return selector;
                }
            }
            return {
                'tag': '*'
            };
        }

        getSelector(element) {
            return this.getSelectorObjects(element).selector;
        }

        getSelectorObjects(element) {
            var item, j, len, parents, result, selector, selectors;
            selectors = [];
            result = '';
            parents = this.getParents(element);
            for (j = 0, len = parents.length; j < len; j++) {
                item = parents[j];
                selector = this.getUniqueSelector(item);
                selectors.unshift(selector);
                result = this.stringifySelectorObject(selector) + (result ? ' > ' + result : '');
                if (this.testSelector(element, result, true)) {
                    return {
                        selector: selector,
                        selectors: selectors,
                        element: item
                    };
                }
            }
            return {};
        }

        stringifySelectorObject(selector) {
            var attribute, clazz;
            clazz = selector.class && selector.class.join('');
            attribute = selector.attribute && selector.attribute.join('');
            return [selector.tag, selector.id, clazz, attribute, selector.nthchild].map(function(s) {
                return s || '';
            }).join('');
        }

        findCombination(items = [], test) {
            var advance, counter, indexes, j, length, ref, result, results;
            // there are 2^items.length combinations, it returns the first matching
            advance = function(indexes) {
                var i, j, k, maxValue, ref, ref1, ref2, startIndex, startValue;
                for (i = j = ref = indexes.length - 1; ref <= 0 ? j <= 0 : j >= 0; i = ref <= 0 ? ++j : --j) {
                    maxValue = items.length - (indexes.length - i);
                    if (indexes[i] < maxValue) { // is incrementable
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
            length = 1; // array range for [1..0] would not be empty
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
        }

    };

    CssSelectorGenerator.prototype.default_options = {
        // choose from 'tag', 'id', 'class', 'nthchild', 'attribute'
        selectors: ['id', 'class', 'tag', 'nthchild'],
        combinationsLimit: 20
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
