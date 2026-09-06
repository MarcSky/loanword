SHELL := /bin/bash

.PHONY: push-with-new-tag
push-with-new-tag:
	@msg="$(text)"; msg=$${msg:-release}; \
	git diff --quiet && git diff --cached --quiet || { echo 'commit your changes first'; exit 1; }; \
	git fetch --tags --force origin >/dev/null 2>&1; \
	cur=$$(node -p "require('./package.json').version"); \
	man=$$(node -p "require('./.claude-plugin/plugin.json').version"); \
	[ "$$cur" = "$$man" ] || { echo "package.json ($$cur) and plugin.json ($$man) disagree"; exit 1; }; \
	IFS=. read -r maj min pat <<< "$$cur"; \
	pat=$$((pat + 1)); \
	if [ $$pat -ge 10 ]; then pat=0; min=$$((min + 1)); fi; \
	if [ $$min -ge 10 ]; then min=0; maj=$$((maj + 1)); fi; \
	ver="$$maj.$$min.$$pat"; tag="v$$ver"; \
	git rev-parse -q --verify "refs/tags/$$tag" >/dev/null && { echo "$$tag already exists"; exit 1; }; \
	echo "New version: $$tag"; \
	npm version --no-git-tag-version --allow-same-version "$$ver" >/dev/null; \
	sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$$ver\"/" .claude-plugin/plugin.json; \
	git add package.json package-lock.json .claude-plugin/plugin.json; \
	git commit -m "$$tag: $$msg"; \
	git tag -a "$$tag" -m "$$msg"; \
	git push origin HEAD "$$tag"
