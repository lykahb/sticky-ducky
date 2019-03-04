'use strict';

function parseRules(whitelist) {
    // Testcase hearthpwn.com###db-tooltip-container
    let rules = [];
    let assert = (isValid, message) => {
        if (!isValid) throw Error(message)
    };
    let parseURLMatcher = pattern => {
        assert(pattern, 'Pattern must not be empty');
        if (pattern.startsWith('||')) {
            let domain = pattern.slice(2);
            assert(domain, 'Domain must not be empty');
            return {domain: domain};
        } else if (pattern.startsWith('|') && pattern.endsWith('|')) {
            let exactAddress = pattern.slice(1, pattern.length - 1);
            assert(exactAddress, 'Exact address must not be empty');
            return {exactAddress: exactAddress};
        } else {
            return {addressPart: pattern};
        }
    };

    whitelist.split('\n').forEach((line, index) => {
        line = line.trim();
        if (!line || line.startsWith('!')) return;

        try {
            let selectorIndex = line.indexOf('##');
            let rule = {};
            if (selectorIndex > 0) {
                rule = parseURLMatcher(line.slice(0, selectorIndex));
                rule.selector = line.slice(selectorIndex + 2);
                assert(rule.selector, 'Selector must not be empty');
            } else {
                rule = parseURLMatcher(line);
            }
            rules.push(rule);
        } catch (e) {
            throw Error(`Error on line ${index+1}: ${e.message}`);
        }
    });
    return rules;
}

function isWhitelistRuleMatch(rule, location) {
    let noHash = location.href;
    let containsDomain = rule => {
        let index = location.hostname.endsWith(rule.domain);
        if (index < 0) return false;
        if (location.hostname.length === rule.domain.length) {
            return true;
        } else if (location.hostname[location.hostname.length - rule.domain.length - 1] === '.') {
            // The hostname is a subdomain of a rule domain
            return true;
        }
        return false;
    };
    if (location.hash) {
        noHash = location.href.slice(0, location.href.length - location.hash.length);
    }
    return (
        rule.href && (rule.exactAddress === location.href || rule.exactAddress === noHash)  // Exact match
        || rule.domain && containsDomain(rule)  //Domain
        || rule.addressPart && location.href.includes(rule.addressPart)  // Anywhere in the address
    );
}

function matchWhitelist(whitelist, location) {
    let selectors = [];
    let type = 'none';
    for (let rule of whitelist) {
        if (isWhitelistRuleMatch(rule, location)) {
            if (rule.selector) {
                type = 'selectors';
                selectors.push(rule.selector);
            } else {
                type = 'page';
                break;
            }
        }
    }

    let result = {
        'type': type,
    };
    if (type === 'selectors') {
        result.selectors = selectors;
    }
    return result;
}