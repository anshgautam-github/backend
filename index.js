const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 5001;

// Identity Fields (Updated with User Details)
const IDENTITY = {
    user_id: "ansh_gautam_07042005",
    email_id: "ag3151@srmsit.edu.in",
    college_roll_number: "RA2311051010035"
};

const validateNodeEdge = (entry) => {
    const trimmed = entry.trim();
    const regex = /^[A-Z]->[A-Z]$/;
    if (!regex.test(trimmed)) return { valid: false, reason: "Format" };
    const [parent, child] = trimmed.split('->');
    if (parent === child) return { valid: false, reason: "Self-loop" };
    return { valid: true, parent, child, original: trimmed };
};

const processGraph = (data) => {
    const validEdges = [];
    const invalid_entries = [];
    const duplicate_edges = [];
    const edgeSet = new Set();
    const childToParent = new Map();
    const adj = {};
    const allNodes = new Set();

    data.forEach(entry => {
        const validation = validateNodeEdge(entry);
        if (!validation.valid) {
            invalid_entries.push(entry);
            return;
        }

        const edgeStr = `${validation.parent}->${validation.child}`;
        if (edgeSet.has(edgeStr)) {
            duplicate_edges.push(validation.original);
            return;
        }

        // Multi-parent rule: first encountered parent wins
        if (childToParent.has(validation.child)) {
            // Silently discard subsequent parent edges for this child
            return;
        }

        edgeSet.add(edgeStr);
        childToParent.set(validation.child, validation.parent);
        if (!adj[validation.parent]) adj[validation.parent] = [];
        adj[validation.parent].push(validation.child);
        allNodes.add(validation.parent);
        allNodes.add(validation.child);
        validEdges.push({ parent: validation.parent, child: validation.child });
    });

    const roots = Array.from(allNodes).filter(node => !childToParent.has(node)).sort();
    const unvisitedNodes = new Set(allNodes);
    const hierarchies = [];

    const buildTree = (node, path = new Set()) => {
        unvisitedNodes.delete(node);
        if (path.has(node)) {
            return { cycle: true };
        }
        path.add(node);
        const children = adj[node] || [];
        const tree = {};
        let maxChildDepth = 0;
        let cycleDetected = false;

        for (const child of children) {
            const result = buildTree(child, new Set(path));
            if (result.cycle) {
                cycleDetected = true;
            } else {
                tree[child] = result.tree;
                maxChildDepth = Math.max(maxChildDepth, result.depth);
            }
        }

        if (cycleDetected) return { cycle: true };
        return { tree, depth: 1 + maxChildDepth };
    };

    // 1. Process valid trees from actual roots
    roots.forEach(root => {
        const result = buildTree(root);
        if (result.cycle) {
            hierarchies.push({
                root,
                tree: {},
                has_cycle: true
            });
        } else {
            hierarchies.push({
                root,
                tree: result.tree,
                depth: result.depth
            });
        }
    });

    // 2. Process pure cycles (nodes not reachable from any root)
    while (unvisitedNodes.size > 0) {
        const nodesArr = Array.from(unvisitedNodes).sort();
        const pseudoRoot = nodesArr[0];
        
        // For pure cycles, we just need to return the root and empty tree
        hierarchies.push({
            root: pseudoRoot,
            tree: {},
            has_cycle: true
        });

        // Remove all nodes in this cycle component from unvisited
        const queue = [pseudoRoot];
        const visitedInComponent = new Set();
        while (queue.length > 0) {
            const curr = queue.shift();
            if (visitedInComponent.has(curr)) continue;
            visitedInComponent.add(curr);
            unvisitedNodes.delete(curr);
            (adj[curr] || []).forEach(child => queue.push(child));
        }
    }

    // Summary calculation
    const total_trees = hierarchies.filter(h => !h.has_cycle).length;
    const total_cycles = hierarchies.filter(h => h.has_cycle).length;
    let largest_tree_root = "";
    let maxDepth = -1;

    hierarchies.forEach(h => {
        if (!h.has_cycle) {
            if (h.depth > maxDepth) {
                maxDepth = h.depth;
                largest_tree_root = h.root;
            } else if (h.depth === maxDepth) {
                if (!largest_tree_root || h.root < largest_tree_root) {
                    largest_tree_root = h.root;
                }
            }
        }
    });

    return {
        ...IDENTITY,
        hierarchies,
        invalid_entries,
        duplicate_edges,
        summary: {
            total_trees,
            total_cycles,
            largest_tree_root
        }
    };
};

app.post('/bfhl', (req, res) => {
    try {
        const { data } = req.body;
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ is_success: false, message: "Invalid input format" });
        }
        const response = processGraph(data);
        res.json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ is_success: false, message: "Internal server error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
