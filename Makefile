SHELL := /bin/bash

.PHONY: push-with-new-tag
push-with-new-tag:
	@test -n "$(text)" || { echo 'usage: make push-with-new-tag text="what changed"'; exit 1; }; \
	git diff --quiet && git diff --cached --quiet || { echo 'commit your changes first'; exit 1; }; \
	git fetch --tags --force origin >/dev/null 2>&1; \
	cur=$$(git tag -l 'v*' | sed 's/^v//' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1); \
	cur=$${cur:-0.0.0}; \
	IFS=. read -r maj min pat <<< "$$cur"; \
	pat=$$((pat + 1)); \
	if [ $$pat -ge 10 ]; then pat=0; min=$$((min + 1)); fi; \
	if [ $$min -ge 10 ]; then min=0; maj=$$((maj + 1)); fi; \
	ver="$$maj.$$min.$$pat"; tag="v$$ver"; \
	echo "New version: $$tag"; \
	npm version --no-git-tag-version --allow-same-version "$$ver" >/dev/null; \
	sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$$ver\"/" .claude-plugin/plugin.json; \
	git add package.json package-lock.json .claude-plugin/plugin.json; \
	git commit -m "$$tag: $(text)"; \
	git tag -a "$$tag" -m "$(text)"; \
	git push origin HEAD "$$tag"
