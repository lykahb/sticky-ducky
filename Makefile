build:
	mkdir -p dist/
	cp -r assets lib *.js LICENSE manifest.json popup.html dist/

clean:
	rm -r dist/