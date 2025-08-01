DIST := dist

prepare:
	mkdir -p ${DIST}
	cp -R assets lib src/popup.html LICENSE ${DIST}
	cp src/js/service-worker.js ${DIST}
	cp src/js/content.js ${DIST}
	cp src/js/explorer.js ${DIST}
	cp src/js/whitelist.js ${DIST}
	cp src/js/popup.js ${DIST}

firefox: DIST := ${DIST}/firefox
firefox: prepare
	cp platform/firefox/manifest.json ${DIST}
	cd ${DIST}; zip -r sticky-ducky@addons.mozilla.org.xpi *

chromium: DIST := ${DIST}/chromium
chromium: prepare
	cp platform/chromium/manifest.json ${DIST}
	cd ${DIST}; zip -r StickyDucky.zip *

clean:
	rm -rf ${DIST}

browserify:
	npm ci
	node_modules/browserify/bin/cmd.js --require css-what --standalone CSSWhat > lib/css-what.js
	node_modules/prettier/bin-prettier.js --write lib/css-what.js

test-firefox:
	make firefox
	@echo "Firefox extension built. Load dist/firefox/ as temporary extension in about:debugging"

test-chromium:
	make chromium
	@echo "Chromium extension built. Load dist/chromium/ as unpacked extension in chrome://extensions"
