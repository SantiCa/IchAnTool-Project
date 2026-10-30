---
title: 'IchAnTool: an open Python package for quantitative ichnofabric analysis of sediment core images'
tags:
  - Python
  - ichnology
  - bioturbation
  - ichnofabric
  - sedimentology
  - image analysis
authors:
  - name: Santiago Casanova-Arenillas
    orcid: 0000-0000-0000-0000  # [TODO]
    affiliation: 1
  # [TODO] co-authors
affiliations:
  - name: '[TODO]'
    index: 1
date: 30 October 2026
bibliography: paper.bib
---

# Summary

Bioturbation intensity is a key parameter of the ichnofabric approach and is routinely
estimated in sediment cores with semi-quantitative visual schemes such as the Bioturbation
Index [@reineck1963; @taylor1993] and the ichnofabric index [@droser1986]. Visual estimation
is subjective, slow, and usually discontinuous along the core. IchAnTool converts segmented
core images into continuous, depth- or age-referenced series of bioturbated-surface
percentage, per-class coverage (e.g. per ichnotaxon), and the corresponding semi-quantitative
indices, ready to be correlated with geochemical, mineralogical, or logging data.

# Statement of need

Digital image treatment has improved the visibility and quantification of trace fossils in
cores [@dorador2014; @dorador2018], but turning treated images into continuous data series
remained a manual, repetitive task. A first version of IchAnTool, a single script, was
introduced in @casanova2020. Version 3 is a complete rewrite as an installable, tested
package with a command-line interface and a Python API, aimed at sedimentologists,
ichnologists, palaeoceanographers, and core-analysis practitioners in academia and industry.
[TODO: one paragraph on existing alternatives and why IchAnTool is needed.]

# Functionality

- Input: treated images (PNG, TIFF, JPEG) with bioturbation painted in a single colour,
  colour-coded classes, or integer label masks.
- Row-wise bioturbated percentage, aggregated into user-defined depth bins.
- Per-class percentages for colour-coded ichnotaxa.
- Configurable index schemes (BI and ii provided).
- Depth-to-age conversion with user age models.
- CSV/Excel export, quick-look plots, and a modular segmentation interface for future
  learned models.
- Results reproduce those of the published version exactly (regression test).

[TODO: figure — example core, mask and output curves (`examples/`).]

# Acknowledgements

[TODO]

# References
