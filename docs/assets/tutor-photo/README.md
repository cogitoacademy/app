# Tutor photo rendering evidence

Screenshots render the actual TutorCard and TutorDrawer components in the local web app, with a synthetic profile and sample landscape photo. They do not represent production data or a live upload test. Desktop: 1280 x 1200; mobile: 390 x 844, before and after scrolling.

Before: AvatarImage had size-full without object-cover, stretching non-square images; the detail drawer enlarged the photo into a wide banner. After: aspect-preserving avatar crop and an 80px rounded identity photo.
