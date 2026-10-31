# Paper 2 — Open annotated dataset and automatic segmentation of bioturbation in core images

**Target:** Earth System Science Data (data focus) or Computers & Geosciences / AI in
Geosciences (method focus). Decide once the dataset size and model results are known.

## Working title
An open, annotated dataset of sediment-core images for automatic segmentation of
bioturbation and ichnotaxa [TODO]

## Provisional abstract
Quantifying bioturbation in cores still depends on manual selection of trace fossils on
images, the main bottleneck of image-based ichnofabric analysis. We present [N] core images
from [sites/expeditions] with expert masks of bioturbation [and ichnotaxa], and train
[model] to segment them automatically. Automatic masks are compared with expert masks and
with visual BI/ii estimates. Data, code (IchAnTool) and trained models are openly released.
[TODO: results]

## Outline
1. Introduction — subjectivity and cost of manual selection; image treatment state of the art.
2. Related work — recent deep-learning approaches to bioturbation [TODO: review, incl.
   Applied Sciences 11(16):7736 (2021) and patent US12142024; verify authors].
3. Data — sources (ODP/IODP, UGR collections), resolution, licences, annotation protocol,
   inter-annotator agreement.
4. Methods — annotation tool, model, training/validation split by core (not by tile).
5. Results — IoU/F1, percentage error per bin, BI/ii agreement.
6. Usage — integration with IchAnTool (`segmentation` module).
7. Data availability — Zenodo/PANGAEA DOI.

## Needs
- [ ] Permission and licence for the images (IODP images are public; UGR treated images: ask).
- [ ] Annotation by ≥2 experts on a subset to measure agreement.
- [ ] GPU for training (a single consumer GPU is enough for a U-Net).
