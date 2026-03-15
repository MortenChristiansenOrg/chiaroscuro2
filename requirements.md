# Requirements for sub tab view

- The parent browser must be visible while sub tabs open and close.
  - Status: Works.
- Sub tabs must animate as they appear and disappear. The animation must animate opacity and scale and animate from the point in the parent tab that was clicked to trigger the sub tab. It must animate in reverse to this point when closing. The sub tab must be visible while animating, it must not be replaced with another element and swapped in after the animation.
  - Status: The sub tab itself might have a slight enter animation (too slight), but it seems linked to the overlay which also animates the size (which it should not). These 2 should not have the same animation. The exit animation for the subtab is also wring. The is something else animating on top of the subtab. I dont know what it is but the subtab itself does not animate.
- An overlay must animate into view when a sub tab is triggered. It should only animate opacity as it enters leaves, not size.
  - Status: Works
- The action palette must be visible on top of any sub tabs that might be visible.
  - Status: Works
- Any subtab should not be dismissed when pressing Esc within the action palette.
  - Status: Works
- Clicking on the overlay should close the subtab.
  - Status: Works
- The overlay must have the exact same demensions and corner radius as the parent tab web content.
  - Status: Works
- The subtab and its two buttons must have a shadow.
  - Status: The buttons have a shadow but the subtab itself does not.

Reminder: The subtabs and animations must all be rendered in the layer on top of the main tab web content. Otherwise it will not be visible.
