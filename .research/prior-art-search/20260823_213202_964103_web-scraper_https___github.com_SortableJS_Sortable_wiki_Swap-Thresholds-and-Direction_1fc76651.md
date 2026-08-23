# Swap Thresholds and Direction

*By: SortableJS | Date: 2019-04-07*

---
title: Swap Thresholds and Direction
author: SortableJS
url: https://github.com/SortableJS/Sortable/wiki/Swap-Thresholds-and-Direction
hostname: github.com
description: Reorderable drag-and-drop lists for modern browsers and touch devices. No jQuery or framework required. - SortableJS/Sortable
sitename: GitHub
date: "2019-04-07"
categories: ['repository:15308499']
---
- 
                Notifications
    You must be signed in to change notification settings
- Fork 3.7k
Swap Thresholds and Direction
There is now a live demo of this feature here: http://sortablejs.github.io/Sortable/#thresholds
The swapThreshold, direction, invertSwap, and invertedSwapThreshold options are all part of the new dragover update. These options are all used to specify when an item in a Sortable should swap with the dragging element (ghost element), and whether it should swap to the top, bottom, left, or right side.
The swapThreshold option specifies what percentage of the item the swap zone must take up. The swap zone is the area of the item which, when dragged over while sorting another item,  will cause the dragging element to swap. For example, the image below is a visual representation of the default swap zone, with the default swapThreshold being 1.
As you can see, half of the item is labeled with +1, and the other half -1.
When a swap zone is labeled with +1, it means that when the sorting item is dragged over that zone, the dragging element will be put after that item. If it is dragging over a -1 zone, it will be inserted before that item.
So, by default, once an item is dragged over one side another item, it is inserted on the opposite side of the item, as shown below.
Modifying the swapThreshold option changes the percentage of the item that the swap zone takes up. For example, a swapThreshold of 0.5 would take up half (50%) of the item, from the center outwards, as shown below. The sections of the element with no label are 0 zones, and do not trigger a swap when dragged over.
Swap glitching is when after a swap, the dragged element goes back to its original position right away, or continues to swap indefinitely until the user moves the mouse off of the target. This is caused by the following scenario. Let’s say the mouse is dragging over a +1 zone, causing the dragging element to swap to the other side of the target, and this pushes the target such that the mouse is now over a -1 zone. This causes the dragging element to go in front of the target, and the mouse to again be on a +1 zone. This process would go on forever if we did not stop it after the first swap.
To do this, we must change the swap zones. In the situation which the mouse would not be past the swapzone, we must invert the swapzone. This means that rather than the swapzones coming from the center of the element, they will come from the edges, and also switch sides. This produces the effect of sorting “in between” two elements, rather than dragging an element into another element’s spot. Sortable gives us the option invertedSwapThreshold, which allows us to set a custom inverted swap zone threshold , but by default, this option will be set to the same as swapThreshold. An example of an inverted swap threshold of 0.5 is shown below.
If we want to always have the effect of dragging “in between” items rather than dragging an item into another item’s position, we can force the inverted swap zone to be used always. This is done by setting the option invertSwap to true. To modify its threshold, either the swapThreshold or invertedSwapThreshold can be set.
The direction option is the final option, but the most important. It defines the direction we want to sort in. Think of it as setting the “axis” of the Sortable to either x or y. If we are using the y axis, we set the option to "vertical". If it’s the x axis, we set the option to "horizontal". The direction is needed for Sortable to determine whether the swap zones take up the width of the target, or the height. Sortable will try to automatically detect which direction is used by default, but it is best that you give this value yourself. In the case that a "grid" formatting is used, it is best to use the actual direction that the elements are going (either breaking right or breaking downwards). An example showing the different swap zone directions is shown below, with the swapThreshold set to 0.5.
The direction option may also be set to a function, which will be fired whenever a target is dragged over. This function is given the arguments evt, target, dragEl, and its job is to return either 'horizontal' or 'vertical'.