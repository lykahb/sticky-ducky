DIST := dist/

prepare:
	mkdir -p ${DIST}
	cp -R assets lib src/* LICENSE ${DIST}

firefox: DIST := ${DIST}/firefox
firefox: prepare
	cp -r platform/firefox/* ${DIST}
	cd ${DIST}; zip -r sticky-ducky@addons.mozilla.org.xpi *

chromium: DIST := ${DIST}/chromium
chromium: prepare
	cp -r platform/chromium/* ${DIST}
	cd ${DIST}; zip -r StickyDucky.zip *

safari: DIST := ${DIST}/StickyDucky.safariextension
safari: prepare
	cp -r platform/safari/* ${DIST}
	cp assets/icon128.png ${DIST}/Icon.png
	cp assets/icon48.png ${DIST}/Icon-48.png
	cp assets/icon128.png ${DIST}/Icon-128.png

clean:
	rm -rf ${DIST}

# node_modules/browserify/bin/cmd.js --require css-what --standalone CSSWhat > lib/css-what-3.2.1.js
# node_modules/browserify/bin/cmd.js --require detect-it --standalone DetectIt > lib/detectIt-3.0.3.js