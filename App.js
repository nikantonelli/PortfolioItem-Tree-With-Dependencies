(function () {
    var Ext = window.Ext4 || window.Ext;

Ext.define('Rally.apps.PortfolioItemTree.app', {
    extend: 'Rally.app.TimeboxScopedApp',
    settingsScope: 'project',
    componentCls: 'app',
    config: {
        defaultSettings: {
            keepTypesAligned: true,
            hideArchived: true,
            showDependencies: false,
            showFilter: true,
            allowMultiSelect: false
        }
    },
    getSettingsFields: function() {
        var returned = [
        {
            name: 'keepTypesAligned',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Columnised Types',
            labelAlign: 'top'
        },
        {
            name: 'hideArchived',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Hide Archived',
            labelAlign: 'top'
        },
        {
            name: 'showExtraText',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Add Project and Prelim Size to titles',
            labelAlign: 'top'
        },
        {
            name: 'allowMultiSelect',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Enable multiple start items (Note: Page Reload required if you change value)',
            labelAlign: 'top'
        },
        {
        //     name: 'showDependencies',
        //     xtype: 'rallycheckboxfield',
        //     fieldLabel: 'Show Dependencies only',
        //     labelAlign: 'top'
        // },{
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Advanced filter',
            name: 'showFilter',
            labelAlign: 'top'
        }
        ];
        return returned;
    },
    itemId: 'rallyApp',
        MIN_COLUMN_WIDTH:   200,        //Looks silly on less than this
        MIN_ROW_HEIGHT: 20 ,                 //
        LOAD_STORE_MAX_RECORDS: 100, //Can blow up the Rally.data.wsapi.filter.Or
        WARN_STORE_MAX_RECORDS: 300, //Can be slow if you fetch too many
        NODE_CIRCLE_SIZE: 8,                //Pixel radius of dots
        LEFT_MARGIN_SIZE: 100,               //Leave space for "World view" text
        STORE_FETCH_FIELD_LIST:
            [
                'Name',
                'FormattedID',
                'Parent',
                'DragAndDropRank',
                'Children',
                'ObjectID',
                'Project',
                'DisplayColor',
                'Owner',
                'Blocked',
                'BlockedReason',
                'Ready',
                'Tags',
                'Workspace',
                'RevisionHistory',
                'CreationDate',
                'PercentDoneByStoryCount',
                'PercentDoneByStoryPlanEstimate',
                'PredecessorsAndSuccessors',
                'State',
                'PreliminaryEstimate',
                'Description',
                'Notes',
                'Predecessors',
                'Successors',
                'OrderIndex',   //Used to get the State field order index
                'PortfolioItemType',
                'Ordinal',
                'Release',
                'Iteration',
                'Milestones',
                //Customer specific after here. Delete as appropriate
                'c_ProjectIDOBN',
                'c_QRWP',
                'c_RAGStatus',
                'c_ProgressUpdate',
                'c_RAIDLOGBYTYPE',
                'c_RAIDSeverityCriticality'
            ],
        CARD_DISPLAY_FIELD_LIST:
            [
                'Name',
                'Owner',
                'PreliminaryEstimate',
                'Parent',
                'Project',
                'PercentDoneByStoryCount',
                'PercentDoneByStoryPlanEstimate',
                'PredecessorsAndSuccessors',
                'State',
                'Milestones',
                //Customer specific after here. Delete as appropriate
                'c_ProjectIDOBN',
                'c_QRWP',
                'c_RAGStatus'

            ],

    items: [
        {  
            xtype: 'container',
            itemId: 'filterBox'
        },{
            xtype: 'container',
            itemId: 'rootSurface',
            margin: '5 5 5 5',
            layout: 'auto',
            title: 'Loading...',
            autoEl: {
                tag: 'svg'
            },
            listeners: {
                afterrender:  function() {  gApp = this.up('#rallyApp'); gApp._onElementValid(this);},
            },
            visible: false
        }
    ],

    timer: null,
    
    _resetTimer: function(callFunc) {
        if ( gApp.timer) { clearTimeout(gApp.timer);}
        gApp.timer = setTimeout(callFunc, 2000);    //Debounce user selections to the tune of two seconds
    },

    //Set the SVG area to the surface we have provided
    _setSVGSize: function(surface) {
        var svg = d3.select('svg');
        svg.attr('width', surface.getEl().dom.clientWidth);
        svg.attr('height',surface.getEl().dom.clientHeight);
    },
    _nodeTree: null,
    //Continuation point after selectors ready/changed

    _enterMainApp: function() {

        gApp._initialiseD3();
        //Get all the nodes and the "Unknown" parent virtual nodes
        var nodetree = gApp._createTree(gApp._nodes);

        //It is hard to calculate the exact size of the tree so we will guess here
        //When we try to use a 'card' we will need the size of the card

        var numColumns = gApp._getSelectedOrdinal()+1; //Leave extras for offset at left and text at right??
        var columnWidth = this.getSize().width/numColumns;
        columnWidth = columnWidth > gApp.MIN_COLUMN_WIDTH ? columnWidth : gApp.MIN_COLUMN_WIDTH;
        treeboxHeight = ((nodetree.leaves().length +1) * gApp.MIN_ROW_HEIGHT) + 10;

        //Get the current size (set by the colour codes helper) and set if bigger only.

        // Set the dimensions in svg to match
        var svg = d3.select('svg');
        var current = gApp.colourBoxSize;
        var viewBoxSize = [columnWidth*numColumns < current[0]?current[0]:columnWidth*numColumns, 
                treeboxHeight< current[1]? current[1]: treeboxHeight];

        //Make surface the size available in the viewport (minus the selectors and margins)
        var rs = this.down('#rootSurface');
        rs.getEl().setWidth(viewBoxSize[0]);
        rs.getEl().setHeight(viewBoxSize[1]);
        //Set the svg area to the surface
        this._setSVGSize(rs);
        svg.attr('class', 'rootSurface');
        svg.attr('preserveAspectRatio', 'none');
        svg.attr('viewBox', '0 0 ' + viewBoxSize[0] + ' ' + (viewBoxSize[1]+ gApp.NODE_CIRCLE_SIZE));

        gApp._nodeTree = nodetree;      //Save for later
        g = svg.append("g")        
            .attr("transform","translate(" + gApp.LEFT_MARGIN_SIZE + ",10)")
            .attr("id","tree");
        //For the size, the tree is rotated 90degrees. Height is for top node to deepest child
        var tree = null;
        if (this.getSetting('keepTypesAligned')) {
            tree = d3.tree()
                .size([viewBoxSize[1], viewBoxSize[0] - (columnWidth + (2*gApp.LEFT_MARGIN_SIZE))])     //Take off a chunk for the text??
                .separation( function(a,b) {
                        return ( a.parent == b.parent ? 1 : 2); //All leaves equi-distant
                    }
                );
        }
        else {
             tree = d3.cluster()
                .size([viewBoxSize[1], viewBoxSize[0] - (columnWidth + (2*gApp.LEFT_MARGIN_SIZE))])     //Take off a chunk for the text??
                .separation( function(a,b) {
                        return ( a.parent == b.parent ? 1 : 1); //All leaves equi-distant
                    }
                );
        }
        tree(nodetree);
        gApp.tree = tree;
        gApp._refreshTree();
    },
    _refreshTree: function(){
        var g = d3.select('#tree');
        var nodetree = gApp._nodeTree;

         g.selectAll(".link")
            .data(nodetree.descendants().slice(1))
            .enter().append("path")
            .attr("class", function(d) { return d.data.invisibleLink? "invisible--link" :  "local--link" ;})
            .attr("d", function(d) {
                    return "M" + d.y + "," + d.x +
                         "C" + (d.parent.y + 100) + "," + d.x +
                         " " + (d.parent.y + 100) + "," + d.parent.x +
                         " " + d.parent.y + "," + d.parent.x;
            })
            ;
        var node = g.selectAll(".node")
            .data(nodetree.descendants())
            .enter().append("g")
            .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

        //We're going to set the colour of the dot depndent on some criteria (in this case only  'State'
        node.append("circle")
            .attr("r", gApp.NODE_CIRCLE_SIZE)
            .attr("class", function (d) {   //Work out the individual dot colour
                var lClass = "dotOutline"; // Might want to use outline to indicate something later

                if (d.data.record.data._ref !== 'root') {
                    if (d.data.record.get('PredecessorsAndSuccessors') && d.data.record.get('PredecessorsAndSuccessors').Count > 0) lClass = "gotDependencies";
                    if (d.data.record.data.ObjectID){
                        if (!d.data.record.get('State')) return "error--node";      //Not been set - which is an error in itself
                        lClass +=  ' q' + ((d.data.record.get('State').OrderIndex-1) + '-' + gApp.numStates[gApp._getOrdFromModel(d.data.record.get('_type'))]); 
                        lClass += gApp._dataCheckForItem(d);
                    } else {
                        return d.data.error ? "error--node": "no--errors--done";
                    }
                }
                return lClass;
            })
            .on("click", function(node, index, array) { gApp._nodeClick(node,index,array);})
            .on("mouseover", function(node, index, array) { gApp._nodeMouseOver(node,index,array);})
            .on("mouseout", function(node, index, array) { gApp._nodeMouseOut(node,index,array);});

        node.append("text")
              .attr("dy", 3)
//              .attr("visible", false)
              .attr('id', function(d) { return 'text' + gApp._getNodeId(d);})
              .attr("x", function(d) { return gApp._textXPos(d);})
              .attr("y", function(d) { return gApp._textYPos(d);})
              .attr("class", function (d) {   //Work out the individual dot colour
                var lClass = "normalText"; // Might want to use outline to indicate something later
                var deferred = [];
                if (d.data.record.data._ref !== 'root') {
                    if (d.data.record.get('Successors').Count > 0) {
                        lClass = "gotSuccText";
                        deferred.push(d.data.record.getCollection('Successors').load());
                    }
                    if (d.data.record.get('Predecessors').Count > 0) {
                        lClass = "gotPredText";
                        deferred.push(d.data.record.getCollection('Predecessors').load());
                    }  
                    if (deferred.length > 0) {
                        Deft.Promise.all(deferred, gApp).then({
                            success: function(responses) {
                                var outOfScope = false;
                                _.each(responses, function(response) {
                                    _.each(response, function(record){
                                        if (!gApp._findNode(gApp._nodes, record.data)) {
                                            outOfScope = true;
                                        }
                                    });
                                });
                                //When you get here, outOfScope will indicate that there are successors or predecessors out of scope
                                // If true, make the text blink (Note: async callback behaviour means you have to d3.select the item again)
                                if (outOfScope) {
                                    var lg = d3.select('#text' + gApp._getNodeId(d));
                                    lg.call(function(d) { d.attr('class', 'textBlink ' + d.attr('class'));});
                                }
                            },
                            failure: function(error) {
                                debugger;
                            }
                        });
                    }
                }
                return lClass;
              })

                //              .style("text-anchor", "start" )
              .style("text-anchor",  function(d) { return gApp._textAnchor(d);})
              .text(function(d) {  
                  var titleText = d.children?d.data.Name : d.data.Name + ' ' + (d.data.record && d.data.record.data.Name); 
                  if ((d.data.record.data._ref !== 'root') && gApp.getSetting('showExtraText')) {
                      var prelimName = d.data.record.get('PreliminaryEstimate') ? d.data.record.get('PreliminaryEstimate').Name : 'Unsized!';
                      titleText += ' (' + d.data.record.get('Project').Name + ' : ' + prelimName + ')';
                  }
                  return titleText;
                });
    },

    _textXPos: function(d){
        return d.children ? -(gApp.NODE_CIRCLE_SIZE + 5) : (gApp.NODE_CIRCLE_SIZE + 5);
    },

    _textYPos: function(d){
        return d.children  ? -5 : 0;
//        return d.children  ? -(gApp.NODE_CIRCLE_SIZE + 5) : 0;
        //        return (d.children  && d.parent) ? -(gApp.NODE_CIRCLE_SIZE + 5) : 0;
    },

    _textAnchor: function(d){
//        if (d.children && d.parent) return 'middle';
        if (!d.children && d. parent) return 'start';
        return 'end';
    },

    _hideLinks: function(){
        var tree = d3.select('#tree');
        var links = tree.selectAll('path');
        links.attr("visibility","hidden");
    },

    _showLinks: function(){
        var tree = d3.select('#tree');
        var links = tree.selectAll('path');
        links.attr("visibility","visible");
    },

    _dependenciesVisible: false,

    _showDependencies: function(d) {
        gApp._dependenciesVisible = true;
        if (d.data.dependencies) {
            d.data.dependencies.select('link').attr("visibility","visible");
            if (d.data.dependencyError) {
                Rally.ui.notify.Notifier.showError({message: 'Warning:' + d.data.record.get('FormattedID') + ' has dependencies outside current selection'});
            }
        }
        else {
            // Create dependencies links
            var r = d.data.record;
            if (r.get('Predecessors').Count>0){
                r.getCollection('Predecessors').load({
                    callback: function(p, op, s) {
                        if (s)  //Success
                        {
                            _.each(p, function(item) {
                                var n = gApp._findNodeById(gApp._nodes, item.get('_ref'));
                                if (n) {
                                    d.data.dependencies.push(n);
                                } else {
                                    d.data.dependencyError = true;
                                    Rally.ui.notify.Notifier.showError({message: 'Warning:' + r.get('FormattedID') + ' has dependencies outside current selection to '+ item.get('FormattedID')});
                                }
                            });
                        }
                    }
                });
            }
            if (r.get('Successors').Count>0){
//                debugger;
            }
        }

    },
    
    _hideDependencies: function(d) {          
        gApp._dependenciesVisible = false;   //Due to async nature, we need to log this
        if (d.dependencies) {
            d.dependencies.select('link').attr("visibility","hidden");
        }
    },
    
    _toggleDependencies: function() {
        if (gApp._dependenciesVisible){
            gApp._showLinks();
            gApp._hideDependencies();
        } else {
            gApp._hideLinks();
            gApp._showDependencies();
        }
    },
    _nodeMouseOut: function(node, index,array){
        if (node.card) node.card.hide();
        gApp._hideDependencies(node);
    },

    _nodeMouseOver: function(node,index,array) {
        if (!(node.data.record.data.ObjectID)) {
            //Only exists on real items, so do something for the 'unknown' item
            return;
        } else {

            if ( !node.card) {
                var card = Ext.create('Rally.ui.cardboard.Card', {
                    'record': node.data.record,
                    fields: gApp.CARD_DISPLAY_FIELD_LIST,
                    constrain: false,
                    width: gApp.MIN_COLUMN_WIDTH,
                    height: 'auto',
                    floating: true, //Allows us to control via the 'show' event
                    shadow: false,
                    showAge: true,
                    resizable: true,
                    listeners: {
                        show: function(card){
                            //Move card to one side, preferably closer to the centre of the screen
                            var xpos = array[index].getScreenCTM().e - gApp.MIN_COLUMN_WIDTH;
                            var ypos = array[index].getScreenCTM().f;
                            card.el.setLeftTop( (xpos - gApp.MIN_COLUMN_WIDTH) < 0 ? xpos + gApp.MIN_COLUMN_WIDTH : xpos - gApp.MIN_COLUMN_WIDTH, 
                                (ypos + this.getSize().height)> gApp.getSize().height ? gApp.getSize().height - (this.getSize().height+20) : ypos);  //Tree is rotated
                        }
                    }
                });
                node.card = card;
            }
            node.card.show();
//            gApp._showDependencies(node);
        }
    },

    _nodePopup: function(node, index, array) {
        var popover = Ext.create('Rally.ui.popover.DependenciesPopover',
            {
                record: node.data.record,
                target: node.card.el
            }
        );
    },

    _nodeClick: function (node,index,array) {
        if (!(node.data.record.data.ObjectID)) return; //Only exists on real items
        //Get ordinal (or something ) to indicate we are the lowest level, then use "UserStories" instead of "Children"
        if (event.shiftKey) { 
            gApp._nodePopup(node,index,array); 
        }  else {
            gApp._dataPanel(node,index,array);
        }
    },

    _dataPanel: function(node, index, array) {        
        var childField = node.data.record.hasField('Children')? 'Children' : 'UserStories';
        var model = node.data.record.hasField('Children')? node.data.record.data.Children._type : 'UserStory';

        Ext.create('Rally.ui.dialog.Dialog', {
            autoShow: true,
            draggable: true,
            closable: true,
            width: 1200,
            height: 800,
            style: {
                border: "thick solid #000000"
            },
            overflowY: 'scroll',
            overflowX: 'none',
            record: node.data.record,
            disableScroll: false,
            model: model,
            childField: childField,
            title: 'Information for ' + node.data.record.get('FormattedID') + ': ' + node.data.record.get('Name'),
            layout: 'hbox',
            items: [
                {
                    xtype: 'container',
                    itemId: 'leftCol',
                    width: 700,
                },
                // {
                //     xtype: 'container',
                //     itemId: 'middleCol',
                //     width: 400
                // },
                {
                    xtype: 'container',
                    itemId: 'rightCol',
                    width: 500  //Leave 20 for scroll bar
                }
            ],
            listeners: {
                afterrender: function() {
                    this.down('#leftCol').add(
                        {
                                xtype: 'rallycard',
                                record: this.record,
                                fields: gApp.CARD_DISPLAY_FIELD_LIST,
                                showAge: true,
                                resizable: true
                        }
                    );

                    if ( this.record.get('c_ProgressUpdate')){
                        this.down('#leftCol').insert(1,
                            {
                                xtype: 'component',
                                width: '100%',
                                autoScroll: true,
                                html: this.record.get('c_ProgressUpdate')
                            }
                        );
                        this.down('#leftCol').insert(1,
                            {
                                xtype: 'text',
                                text: 'Progress Update: ',
                                style: {
                                    fontSize: '13px',
                                    textTransform: 'uppercase',
                                    fontFamily: 'ProximaNova,Helvetica,Arial',
                                    fontWeight: 'bold'
                                },
                                margin: '0 0 10 0'
                            }
                        );
                    }
                    //This is specific to customer. Features are used as RAIDs as well.
                    if ((this.record.self.ordinal === 1) && this.record.hasField('c_RAIDType')){
                        var rai = this.down('#leftCol').add(
                            {
                                xtype: 'rallypopoverchilditemslistview',
                                target: array[index],
                                record: this.record,
                                childField: this.childField,
                                addNewConfig: null,
                                gridConfig: {
                                    title: '<b>Risks and Issues:</b>',
                                    enableEditing: false,
                                    enableRanking: false,
                                    enableBulkEdit: false,
                                    showRowActionsColumn: false,
                                    storeConfig: this.RAIDStoreConfig(),
                                    columnCfgs : [
                                        'FormattedID',
                                        'Name',
                                        'c_RAIDType',
                                        'c_RAIDSeverityCriticality',
                                        {
                                            text: 'RAG Status',
                                            dataIndex: 'Project',  //Just so that the renderer gets called
                                            minWidth: 80,
                                            renderer: function (value, metaData, record, rowIdx, colIdx, store) {
                                                var retval = '';
                                                    debugger;
                                                return (retval);
                                            }
                                        },
                                        'ScheduleState'
                                    ]
                                },
                                model: this.model
                            }
                        );
                        rai.down('#header').destroy();
                   }
                    var children = this.down('#leftCol').add(
                        {
                            xtype: 'rallypopoverchilditemslistview',
                            target: array[index],
                            record: this.record,
                            childField: this.childField,
                            addNewConfig: null,
                            gridConfig: {
                                title: '<b>Children:</b>',
                                enableEditing: false,
                                enableRanking: false,
                                enableBulkEdit: false,
                                showRowActionsColumn: false,
                                storeConfig: this.nonRAIDStoreConfig(),
                                columnCfgs : [
                                    'FormattedID',
                                    'Name',
                                    {
                                        text: '% By Count',
                                        dataIndex: 'PercentDoneByStoryCount'
                                    },
                                    {
                                        text: '% By Est',
                                        dataIndex: 'PercentDoneByStoryPlanEstimate'
                                    },
                                    {
                                        text: 'Timebox',
                                        dataIndex: 'Project',  //Just so that the renderer gets called
                                        minWidth: 80,
                                        renderer: function (value, metaData, record, rowIdx, colIdx, store) {
                                            var retval = '';
                                                if (record.hasField('Iteration')) {
                                                    retval = record.get('Iteration')?record.get('Iteration').Name:'NOT PLANNED';
                                                } else if (record.hasField('Release')) {
                                                    retval = record.get('Release')?record.get('Release').Name:'NOT PLANNED';
                                                } else if (record.hasField('PlannedStartDate')){
                                                    retval = Ext.Date.format(record.get('PlannedStartDate'), 'd/M/Y') + ' - ' + Ext.Date.format(record.get('PlannedEndDate'), 'd/M/Y');
                                                }
                                            return (retval);
                                        }
                                    },
                                    'State',
                                    'PredecessorsAndSuccessors',
                                    'Project',
                                    'c_RAGSatus',
                                    'ScheduleState'
                                ]
                            },
                            model: this.model
                        }
                    );
                    children.down('#header').destroy();

                    var cfd = Ext.create('Rally.apps.CFDChart', {
                        record: this.record,
                        container: this.down('#rightCol')
                    });
                    cfd.generateChart();

                    //Now add predecessors and successors
                //     var preds = this.down('#rightCol').add(
                //         {
                //             xtype: 'rallypopoverchilditemslistview',
                //             target: array[index],
                //             record: this.record,
                //             childField: 'Predecessors',
                //             addNewConfig: null,
                //             gridConfig: {
                //                 title: '<b>Predecessors:</b>',
                //                 enableEditing: false,
                //                 enableRanking: false,
                //                 enableBulkEdit: false,
                //                 showRowActionsColumn: false,
                //                 columnCfgs : [
                //                 'FormattedID',
                //                 'Name',
                //                 {
                //                     text: '% By Count',
                //                     dataIndex: 'PercentDoneByStoryCount'
                //                 },
                //                 {
                //                     text: '% By Est',
                //                     dataIndex: 'PercentDoneByStoryPlanEstimate'
                //                 },
                //                 'State',
                //                 'c_RAGSatus',
                //                 'ScheduleState'
                //                 ]
                //             },
                //             model: this.model
                //         }
                //     );
                //     preds.down('#header').destroy();
                //     var succs = this.down('#rightCol').add(
                //         {
                //             xtype: 'rallypopoverchilditemslistview',
                //             target: array[index],
                //             record: this.record,
                //             childField: 'Successors',
                //             addNewConfig: null,
                //             gridConfig: {
                //                 title: '<b>Successors:</b>',
                //                 enableEditing: false,
                //                 enableRanking: false,
                //                 enableBulkEdit: false,
                //                 showRowActionsColumn: false,
                //                 columnCfgs : [
                //                 'FormattedID',
                //                 'Name',
                //                 {
                //                     text: '% By Count',
                //                     dataIndex: 'PercentDoneByStoryCount'
                //                 },
                //                 {
                //                     text: '% By Est',
                //                     dataIndex: 'PercentDoneByStoryPlanEstimate'
                //                 },
                //                 'State',
                //                 'c_RAGSatus',
                //                 'ScheduleState'
                //                 ]
                //             },
                //             model: this.model
                //         }
                //     );
                //     succs.down('#header').destroy();
                }
            },

            //This is specific to customer. Features are used as RAIDs as well.
            nonRAIDStoreConfig: function() {
                if (this.record.hasField('c_RAIDType') ){
                    switch (this.record.self.ordinal) {
                        case 1:
                            return  {
                                filters: {
                                    property: 'c_RAIDType',
                                    operator: '=',
                                    value: ''
                                },
                                fetch: gApp.STORE_FETCH_FIELD_LIST
                            };
                        default:
                            return {
                                fetch: gApp.STORE_FETCH_FIELD_LIST                                
                            };
                    }
                }
                else return {
                    fetch: gApp.STORE_FETCH_FIELD_LIST                                                    
                };
            },

            //This is specific to customer. Features are used as RAIDs as well.
            RAIDStoreConfig: function() {
                var retval = {};

                if (this.record.hasField('c_RAIDType')){
                            return {
                                filters: [{
                                    property: 'c_RAIDType',
                                    operator: '!=',
                                    value: ''
                                }]
                            };
                    }
                else return {};
            },

            RISKColour: function(severity, probability, state) {
                if ( state === 'Closed' || state === 'Cancelled') {
                    return 'RAID-blue';
                }

                if (state === 'Exceptional') {
                    return 'RAID-red textBlink';
                }

                if (state ==='High' && (probability === 'Likely' || probability === 'Certain'))
                {
                    return 'RAID-red';
                }

                if (
                    (state ==='High' && (probability === 'Unlikely' || probability === 'Possible')) ||
                    (state ==='Moderate' && (probability === 'Likely' || probability === 'Certain'))
                ){
                    return 'RAID-amber';
                }
                if (
                    (state ==='Moderate' && (probability === 'Unlikely' || probability === 'Possible')) ||
                    (state ==='Low')
                ){
                    return 'RAID-green';
                }
                
                var lClass = 'RAID-missing';
                if (!severity) lClass += '-severity';
                if (!probability) lClass += '-probability';

                return lClass;
            },

            AIDColour: function(severity, probability, state) {
                if ( state === 'Closed' || state === 'Cancelled') {
                    return 'RAID-blue';
                }

                if (state === 'Exceptional') 
                {
                    return 'RAID-red';
                }

                if (state === 'High') 
                {
                    return 'RAID-amber';
                }

                if ((state === 'Moderate') ||
                    (state === 'Low')
                ){
                    return 'RAID-green';                    
                }
            }
        });
    },

    _dataCheckForItem: function(d){
        return "";
    },
    //Entry point after creation of render box
    _onElementValid: function(rs) {
        gApp.timeboxScope = gApp.getContext().getTimeboxScope(); 
        //Add any useful selectors into this container ( which is inserted before the rootSurface )
        //Choose a point when all are 'ready' to jump off into the rest of the app
        var hdrBoxConfig = {
            xtype: 'container',
            itemId: 'headerBox',
            layout: 'hbox',
            items: [
                
                {
                    xtype:  'rallyportfolioitemtypecombobox',
                    itemId: 'piType',
                    fieldLabel: 'Choose Portfolio Type :',
                    labelWidth: 100,
                    margin: '5 0 5 20',
                    defaultSelectionPosition: 'first',
//                    storeConfig: {
//                        sorters: {
//                            property: 'Ordinal',
//                            direction: 'ASC'
//                        }
//                    },
                    listeners: {
                        select: function() { gApp._kickOff();},    //Jump off here to add portfolio size selector
                        ready: function() { gApp._addColourHelper(); }
                    }
                },
            ]
        };
        
        if (this.getSetting('showDependencies')){
            hdrBoxConfig.items.push(
                {
                    xtype: 'rallybutton',
                    text: 'Toggle Dependencies',
                    handler: function() {
                        gApp._toggleDependencies();
                    }
                }
            );
        }   

        var hdrBox = this.insert (0,hdrBoxConfig);
        
    },

    numStates: [],
    colourBoxSize: null,

    _addColourHelper: function() {
        var hdrBox = gApp.down('#headerBox');
        var numTypes = gApp._highestOrdinal() + 1;
        var modelList = gApp._getTypeList(numTypes);  //Doesn't matter if we are one over here.

        //Get the SVG surface and add a new group
        var svg = d3.select('svg');
        //Set a size big enough to hold the colour palette (which may get bigger later)
        gApp.colourBoxSize = [gApp.MIN_COLUMN_WIDTH*numTypes, 20 * gApp.MIN_ROW_HEIGHT];   //Guess at a maximum of 20 states per type

        //Make surface the size available in the viewport (minus the selectors and margins)
        var rs = this.down('#rootSurface');
        rs.getEl().setWidth(gApp.colourBoxSize[0]);
        rs.getEl().setHeight(gApp.colourBoxSize[1]);
        //Set the svg area to the surface
        this._setSVGSize(rs);
        // Set the view dimensions in svg to match
        svg.attr('class', 'rootSurface');
        svg.attr('preserveAspectRatio', 'none');
        svg.attr('viewBox', '0 0 ' + gApp.colourBoxSize[0] + ' ' + (gApp.colourBoxSize[1]+ gApp.NODE_CIRCLE_SIZE));
        var colours = svg.append("g")    //New group for colours
            .attr("id", "colourLegend")
            .attr("transform","translate(" + gApp.LEFT_MARGIN_SIZE + ",10)");
        //Add some legend specific sprites here

        _.each(modelList, function(modeltype) {
            gApp._addColourBox(modeltype);
        });

    },

    _addColourBox: function(modeltype) {
//        var colourBox = d3.select('#colourLegend' + modelNum);
        
        var colours = d3.select('#colourLegend');
//        if (!colourBox) {
            colours.append("g")
                .attr("id", "colourLegend" + modeltype.Ordinal)
                .attr("transform","translate(" + (gApp.MIN_COLUMN_WIDTH*modeltype.Ordinal) + ",10)");
//        }
        var colourBox = d3.select('#colourLegend' + modeltype.Ordinal);
            var lCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            colourBox.append("text")
                .attr("dx", -gApp.NODE_CIRCLE_SIZE )
                .attr("dy", -(gApp.NODE_CIRCLE_SIZE+2))
                .attr("x",  0)
                .attr("y", 0)
//              .style("text-anchor", "start" )
                .style("text-anchor",  'start')
                .text(modeltype.Name);

            //Now fetch all the values for the State field
            //And then add the colours
            var typeStore = Ext.create('Rally.data.wsapi.Store',
                {
                    model: 'State',
                    filters: [{
                        property: 'TypeDef',
                        value: modeltype.ref
                    },
                    {
                        property: 'Enabled',
                        value: true
                    }],
                    context: gApp.getContext().getDataContext(),
                    fetch: true
                }
            );
            typeStore.load().then({ 
                success: function(records){
                    gApp.numStates[modeltype.Ordinal] = records.length;
                    _.each(records, function(state){
                        var idx = state.get('OrderIndex');
                        colourBox.append("circle")
                            .attr("cx", 0)
                            .attr("cy", idx * gApp.MIN_ROW_HEIGHT)    //Leave space for text of name
                            .attr("r", gApp.NODE_CIRCLE_SIZE)
                            .attr("class", "q" + (state.get('OrderIndex')-1) + '-' + records.length);
                        colourBox.append("text")
                            .attr("dx", gApp.NODE_CIRCLE_SIZE+2)
                            .attr("dy", gApp.NODE_CIRCLE_SIZE/2)
                            .attr("x",0)
                            .attr("y",idx * gApp.MIN_ROW_HEIGHT)
                            .attr("text-anchor", 'start')
                            .text(state.get('Name'));
                    });
                },
                failure: function(error) {
                    debugger;
                }
            });
        
       colours.attr("visibility","hidden");    //Render, but mask it. Use "visible" to show again
    },

    _nodes: [],

    onSettingsUpdate: function() {
        if ( gApp._nodes) gApp._nodes = [];
        gApp._getArtifacts( gApp.down('#itemSelector').valueModels);
    },

    onTimeboxScopeChange: function(newTimebox) {
        this.callParent(arguments);
        gApp.timeboxScope = newTimebox;
        if ( gApp._nodes) gApp._nodes = [];
        gApp._getArtifacts( [gApp.down('#itemSelector').getRecord()]);
    },

    _onFilterChange: function(inlineFilterButton){
        gApp.advFilters = inlineFilterButton.getTypesAndFilters().filters;
        inlineFilterButton._previousTypesAndFilters = inlineFilterButton.getTypesAndFilters();
        if ( gApp._nodes.length) {
            gApp._nodes = [];
            gApp._getArtifacts( [gApp.down('#itemSelector').getRecord()]);
        }
    },

    _onFilterReady: function(inlineFilterPanel) {
        gApp.down('#filterBox').add(inlineFilterPanel);
    },

    _kickOff: function() {
        var ptype = gApp.down('#piType');
        var hdrBox = gApp.down('#headerBox');
        gApp._typeStore = ptype.store;
        var selector = gApp.down('#itemSelector');
        if ( selector) {
            selector.destroy();
        }
        var is = hdrBox.insert(2,{
            xtype: 'rallyartifactsearchcombobox',
            fieldLabel: 'Choose Start Item :',
            itemId: 'itemSelector',
            multiSelect: gApp.getSetting('allowMultiSelect'),
            labelWidth: 100,
            queryMode: 'remote',
            allowNoEntry: false,
            pageSize: 200,
            width: 600,
            margin: '10 0 5 20',
            stateful: true,
            stateId: this.getContext().getScopedStateId('itemSelector'),
            storeConfig: {
                models: [ 'portfolioitem/' + ptype.rawValue ],
                fetch: gApp.STORE_FETCH_FIELD_LIST,
                context: gApp.getContext().getDataContext(),
                pageSize: 200,
                autoLoad: true
            },
            listeners: {
                // select: function(selector,records) {
                //     this.startAgain(selector,this.valueModels);
                // },
                change: function(selector,records) {
                    if (records.length > 0) {
                        gApp._resetTimer(this.startAgain);
                    }
                }
            },
            startAgain: function () {
                var records = gApp.down('#itemSelector').valueModels;
                if ( gApp._nodes) gApp._nodes = [];
                if (records.length > 1) {
                        gApp._nodes.push({'Name': 'Combined View',
                        'record': {
                            'data': {
                                '_ref': 'root',
                                'Name': ''
                            }
                        },
                        'local':true
                    });
                }
                gApp._getArtifacts(records);
            }
        });   

        Ext.util.Observable.capture( is, function(event) { console.log('event', event, arguments);});
        if(gApp.getSetting('showFilter') && !gApp.down('#inlineFilter')){
            hdrBox.add({
                xtype: 'rallyinlinefiltercontrol',
                name: 'inlineFilter',
                itemId: 'inlineFilter',
                margin: '10 0 5 20',                           
                context: this.getContext(),
                height:26,
                inlineFilterButtonConfig: {
                    stateful: true,
                    stateId: this.getContext().getScopedStateId('inline-filter'),
                    context: this.getContext(),
//                    modelNames: ['PortfolioItem/' + ptype.rawValue], //NOOOO!
                    modelNames: gApp._getModelFromOrd(0), //We actually want to filter the features... YESSSS!
                    filterChildren: false,
                    inlineFilterPanelConfig: {
                        quickFilterPanelConfig: {
                            defaultFields: ['ArtifactSearch', 'Owner']
                        }
                    },
                    listeners: {
                        inlinefilterchange: this._onFilterChange,
                        inlinefilterready: this._onFilterReady,
                        scope: this
                    } 
                }
            });
        }

        var buttonTxt = "Colour Codes";
        if (!gApp.down('#colourButton')){
            hdrBox.add({
                xtype: 'rallybutton',
                itemId: 'colourButton',
                margin: '10 0 5 20',
                ticked: false,
                text: buttonTxt,
                handler: function() {
                    if (this.ticked === false) {
                        this.setText('Return');
                        this.ticked = true;
                        d3.select("#colourLegend").attr("visibility","visible");
                        d3.select("#tree").attr("visibility", "hidden");
                    } else {
                        this.setText(buttonTxt);
                        this.ticked = false;
                        d3.select("#colourLegend").attr("visibility","hidden");
                        d3.select("#tree").attr("visibility", "visible");
                    }
                }
            });
        }

        if (!gApp.down('#infoButton')){
                hdrBox.add( {
                xtype: 'rallybutton',
                itemId: 'infoButton',
                margin: '10 0 5 20',
                align: 'right',
                text: 'Page Info',
                handler: function() {
                    Ext.create('Rally.ui.dialog.Dialog', {
                        autoShow: true,
                        draggable: true,
                        closable: true,
                        width: 500,
                        autoScroll: true,
                        maxHeight: 600,
                        title: 'Information about this app',
                        items: {
                            xtype: 'component',
                            html: 
                                '<p class="boldText">Hierarchical Tree View</p>' +
                                '<p>This app will find all the children of a particular Portfolio artefact. You can choose the type of artefact,' +
                                ' then the top level artefact itself.</p>' +
                                '<p>The colours of the circles indicate the state of progress from red (those that are not started), through to' +
                                ' blue (in their final stages). Click on the "Colour Codes" button to see the colour to state mapping for each' +
                                ' portfolio item type.</p>' +
                                '<p class="boldText">Choosing collections</p>' +
                                '<p>The app settings contains an option to allow you to multi-select the top level artefacts. This allows you to' +
                                ' choose a number of portfolio items of interest and then filter for the features</p>' +
                                '<p class="boldText">Visualising Dependencies</p>' +
                                '<p>The edge of the circle will be red if there are any dependencies (predecessors or successors) and the colour ' +
                                'of the associated text will indicate those with predecessors (red text) and those with successors (green text). ' +
                                'Those with both will appear as having predecessors</p>' +
                                '<p>If the text is blinking, it means that the relevant dependency is not being shown in this data set. </p>' +
                                '<p class="boldText">Exploring the data</p><p>You can investigate dependencies by using &lt;shift&gt;-Click ' +
                                'on the circle. This will call up an overlay with the relevant dependencies. Clicking on the FormattedID on any' +
                                ' artefact in the overlay will take you to it in either the EDP or QDP page (whichever you have enabled for your' +
                                ' session )</p>' +
                                '<p>If you click on the circle without using shift, then a data panel will appear containing more information about that artefact</p>' +
                                '<p class="boldText">Filtering</p>' +
                                '<p>There are app settings to enable the extra filtering capabilities on the main page, so that you can choose which lowest-level portfolio items to see' +
                                ' e.g. filter on Owner, Investment Type, etc. </p><p>To filter by release (e.g. to find all those features scheduled into a Program Increment)' +
                                ' you will need to edit the Page settings (not the App Settings) to add a Release filter</p><p>Filtering by an Agile Central Milestone artefact' +
                                ' is not yet possible</p>' +
                                '<p>Source code available here: <br/><a href=https://github.com/nikantonelli/PortfolioItem-Tree-With-Dependencies> Github Repo</a></p>',
                            padding: 10
                        }
                    });
                }
            } );
        }
    },


    _getArtifacts: function(data) {
        //On re-entry send an event to redraw
console.log( ' Adding: ', data);
        gApp._nodes = gApp._nodes.concat( gApp._createNodes(data));    //Add what we started with to the node list

        this.fireEvent('redrawTree');
        //Starting with highest selected by the combobox, go down

        _.each(data, function(record) {
            if (record.get('Children')){                                //Limit this to feature level and not beyond.
                collectionConfig = {
                    sorters: [
                        {
                            property: 'DragAndDropRank',
                            direction: 'ASC'
                        }
                    ],
                    fetch: gApp.STORE_FETCH_FIELD_LIST,
                    callback: function(records, operation, success) {
                        //Start the recursive trawl down through the levels
                        if (success && records.length)  gApp._getArtifacts(records);
                    },
                    filters: []
                };
                if (gApp.getSetting('hideArchived')) {
                    collectionConfig.filters.push({
                        property: 'Archived',
                        operator: '=',
                        value: false
                    });
                }

                if (record.get('PortfolioItemType').Ordinal < 2) { //Only for lowest level item type)
                    if(gApp.getSetting('showFilter') && gApp.advFilters && gApp.advFilters.length > 0){
                        Ext.Array.each(gApp.advFilters,function(filter){
                            collectionConfig.filters.push(filter);
                        });
                    }

                    // if (gApp.getSetting('showDependencies') ) {
                    //     collectionConfig.filters.push(
                    //         {
                    //             property: 'PredecessorsAndSuccessors.Count',
                    //             operator: '!=',
                    //             value: false
                    //         }
                    //     )
                    // }

                    if((gApp.timeboxScope && gApp.timeboxScope.type.toLowerCase() === 'release') 
                    )
                    {
                        collectionConfig.filters.push(gApp.timeboxScope.getQueryFilter());
                    }
                }
                record.getCollection( 'Children').load( collectionConfig );
            }
        });
    },

    _createNodes: function(data) {
        //These need to be sorted into a hierarchy based on what we have. We are going to add 'other' nodes later
        var nodes = [];
        //Push them into an array we can reconfigure
        _.each(data, function(record) {
            var localNode = (gApp.getContext().getProjectRef() === record.get('Project')._ref);
            nodes.push({'Name': record.get('FormattedID'), 'record': record, 'local': localNode, 'dependencies': []});
        });
        return nodes;
    },

    _findNode: function(nodes, recordData) {
        var returnNode = null;
            _.each(nodes, function(node) {
                if (node.record && (node.record.data._ref === recordData._ref)){
                     returnNode = node;
                }
            });
        return returnNode;

    },
    _findParentType: function(record) {
        //The only source of truth for the hierachy of types is the typeStore using 'Ordinal'
        var ord = null;
        for ( var i = 0;  i < gApp._typeStore.totalCount; i++ )
        {
            if (record.data._type === gApp._typeStore.data.items[i].get('TypePath').toLowerCase()) {
                ord = gApp._typeStore.data.items[i].get('Ordinal');
                break;
            }
        }
        ord += 1;   //We want the next one up, if beyond the list, set type to root
        //If we fail this, then this code is wrong!
        if ( i >= gApp._typeStore.totalCount) {
            return null;
        }
        var typeRecord =  _.find(  gApp._typeStore.data.items, function(type) { return type.get('Ordinal') === ord;});
        return (typeRecord && typeRecord.get('TypePath').toLowerCase());
    },
    _findNodeById: function(nodes, id) {
        return _.find(nodes, function(node) {
            return node.record.data._ref === id;
        });
    },
    _findParentNode: function(nodes, child){
        if (child.record.data._ref === 'root') return null;
        var parent = child.record.data.Parent;
        var pParent = null;
        if (parent ){
            //Check if parent already in the node list. If so, make this one a child of that one
            //Will return a parent, or null if not found
            pParent = gApp._findNode(nodes, parent);
        }
        else {
            //Here, there is no parent set, so attach to the 'null' parent.
            var pt = gApp._findParentType(child.record);
            //If we are at the top, we will allow d3 to make a root node by returning null
            //If we have a parent type, we will try to return the null parent for this type.
            if (pt) {
                var parentName = '/' + pt + '/null';
                pParent = gApp._findNodeById(nodes, parentName);
            }
        }
        //If the record is a type at the top level, then we must return something to indicate 'root'
        return pParent?pParent: gApp._findNodeById(nodes, 'root');
    },
        //Routines to manipulate the types

    _getSelectedOrdinal: function() {
        return gApp.down('#piType').lastSelection[0].get('Ordinal');
    },

     _getTypeList: function(highestOrdinal) {
        var piModels = [];
        _.each(gApp._typeStore.data.items, function(type) {
            //Only push types below that selected
            if (type.data.Ordinal <= (highestOrdinal ? highestOrdinal: 0) )
                piModels.push({ 'type': type.data.TypePath.toLowerCase(), 'Name': type.data.Name, 'ref': type.data._ref, 'Ordinal': type.data.Ordinal});
        });
        return piModels;
    },

    _highestOrdinal: function() {
        return _.max(gApp._typeStore.data.items, function(type) { return type.get('Ordinal'); }).get('Ordinal');
    },
    _getModelFromOrd: function(number){
        var model = null;
        _.each(gApp._typeStore.data.items, function(type) { if (number == type.get('Ordinal')) { model = type; } });
        return model && model.get('TypePath');
    },

    _getOrdFromModel: function(modelName){
        var model = null;
        _.each(gApp._typeStore.data.items, function(type) {
            if (modelName == type.get('TypePath').toLowerCase()) {
                model = type.get('Ordinal');
            }
        });
        return model;
    },

    _createTree: function (nodes) {
        //Try to use d3.stratify to create nodet
        var nodetree = d3.stratify()
                    .id( function(d) {
                        var retval = (d.record && d.record.data._ref) || null; //No record is an error in the code, try to barf somewhere if that is the case
                        return retval;
                    })
                    .parentId( function(d) {
                        var pParent = gApp._findParentNode(nodes, d);
                        return (pParent && pParent.record && pParent.record.data._ref); })
                    (nodes);
        return nodetree;
    },

    redrawTree: function() {
        if (gApp._nodeTree) {
            d3.select("#tree").remove();
            gApp._nodeTree = null;
        }
        gApp._enterMainApp();
    },

    _getNodeId: function(d){
        if (d.data.record.data._ref === 'root') { return Ext.id();}
        return d.data.record? d.data.record.get('FormattedID'): Ext.id();
    },

    launch: function() {

        this.on('redrawTree', this.redrawTree);
    },

    initComponent: function() {
        this.callParent(arguments);
        this.addEvents('redrawTree');
    },

    _initialiseD3: function() {
        d3.selection.prototype.addPredecessors = function  (nodes) {
            return this.each(function(node, index, array) {
                var record = node.data.record;
                if (record.data.ObjectID && record.get('Predecessors').Count) {    //Only real ones have this
                    record.getCollection('Predecessors').load().then({
                        success: function(preds) {
                            _.each(preds, function(pred){
                                var pn = _.find(nodes.nodes, function(d) {
                                    return d.data.record && (d.data.record.data._ref === pred.get('_ref'));
                                });
                                pn.append("path")
                                    .attr("class", "predecessor--link")
                                    .attr("d", function(d) {
                                        return "M" + d.y + "," + d.x +
                                             "S" + (d.y - 100) + "," + d.x + ((d.x - node.x)/2) +
                                             " " + node.y + "," + node.x;
                                });

                            });
                        },
                        failure: function(error) {
//                            debugger;
                        }
                    });
                }
            });
        };
    }
});
}());