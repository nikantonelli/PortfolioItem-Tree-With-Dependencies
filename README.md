Portfolio Item Tree
===================

## Overview

Another take on the Portfolio Items page in Rally. This time using a dendogram style visualisation.

This app will allow you to select a type, then an item in your scope with that type and then it will create a tree of the child artifacts.

If you hover over a particular dot, it will give you a 'rallycard' style pop-up. If you click on the dot, it gives you that card and then a list of the children associated with it. This works for all levels of portfolio item, so for features, 
you will see the child user stories.

The colour coding shows the 'state' of the item and the edge of the circle will be red if there are dependencies of either 
type: successors or predecessors. The text of the item with be red for those with predecessors and a strnage green colour
for those with successors

The idea behind this is that you might want to set up a consistent view (via either the hover or via the pop-up) to explore the status graphically without loads of clicks.

It could be extended to include user stories, but that was not really useful info for the top level managers.

![alt text](https://github.com/nikantonelli/PortfolioItem-Tree/blob/master/Images/overview.png)
