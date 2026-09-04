# CEFR-graded lemmas

`en.tsv` is `lemma<TAB>part of speech<TAB>level`, one line per lemma, sorted.
It anchors the level of an English single-word card (`lexis.md` L-51): a model
places adjacent bands wrong far more often than a graded list does, so where
the list knows a lemma its level wins over the one the builder guessed.
Phrases keep the builder's label — the list holds lemmas only.

Two sources, merged, the lower level kept when both list a word:

- **CEFR-J Vocabulary Profile 1.5** (A1–B2), Tono Laboratory, Tokyo
  University of Foreign Studies, via Open Language Profiles —
  https://github.com/openlanguageprofiles/olp-en-cefrj — free for research and
  commercial use provided the dataset is cited.
- **Octanove Vocabulary Profile C1/C2 1.0** (C1–C2), from the same
  repository, under the same terms.

Rebuilt by hand from those two CSVs; nothing here is generated at build time
and nothing is fetched at run time.

Only English is shipped. The other CEFR-graded lists — CEFRLex (FLELex,
EFLLex, SVALex, ELELex, NT2Lex, DAFlex) and Kelly — are CC BY-NC-SA, which
this repository cannot carry, and Oxford's list is copyright OUP.
