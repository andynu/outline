# Competitive Analysis: Obsidian vs Outline

## Executive Summary

Obsidian is a local-first, Markdown-based note-taking app built around a file-per-note vault model with an extraordinary community plugin ecosystem (2,700+ plugins). Outline is a hierarchical outliner emphasizing clean UX, date-driven workflows, and desktop-native performance via Tauri 2.

The two tools share a local-first philosophy but diverge fundamentally in architecture: Obsidian is a page-centric Markdown editor that relies on community plugins to fill feature gaps; Outline is a node-centric outliner with integrated dates, recurrence, and iCal output. Obsidian's key advantage is ecosystem breadth -- its plugin marketplace has created a self-reinforcing community of users, plugin developers, and content creators. Outline's key advantages are hierarchical structure, integrated task/date management, and a unified editing experience that does not depend on third-party plugins.

The most important lesson from Obsidian is not any single feature but what its top plugins reveal about unmet user needs: structured metadata querying (Dataview), task management across notes (Tasks), visual thinking (Excalidraw/Canvas), and templates for reducing friction. These signals should inform Outline's roadmap without replicating Obsidian's plugin-dependent model.

---

## Core Model Comparison

| Aspect | Obsidian | Outline |
|--------|----------|---------|
| **Primary unit** | Note (Markdown file) | Node (bullet/checkbox/heading) |
| **Hierarchy** | Folder structure + note nesting via links | Unlimited nested nodes within documents |
| **Organization** | Folders, tags (YAML frontmatter), links | Documents, folders, hashtags, wiki links |
| **Content format** | Plain Markdown files (one file per note) | JSONL operation log + state.json snapshots |
| **Cross-linking** | `[[wikilinks]]` with aliases, unlinked mentions | Wiki links `[[doc]]`, backlinks panel |
| **Data storage** | Plain files in a "vault" directory | JSONL files in `~/.outline-data/` |
| **Platform** | Electron (custom renderer) | Tauri 2 (Rust + Svelte 5) |
| **Extensibility** | 2,700+ community plugins | Integrated features, no plugin system |
| **Business model** | Free app + paid Sync ($4-8/mo) + Publish ($8/mo) | Self-hosted, no paid services |

### Analysis

Obsidian's file-per-note model makes each note a standalone Markdown file, which is excellent for portability and interoperability with other tools. However, this model has no native concept of hierarchy within a note -- nested structure must be created through links between files or through indentation within a single note. Outline's node-based tree model provides hierarchy as a first-class concept, which is fundamentally better suited for outlining workflows.

Obsidian's vault is analogous to Outline's data directory, but the granularity differs: Obsidian has one file per note (potentially thousands of small files), while Outline has one directory per document containing state and pending files. Obsidian's approach creates more filesystem overhead and sync complexity but allows individual notes to be opened in any text editor.

---

## Plugin Ecosystem Analysis

### Top 20 Most Downloaded Plugins (2025 data)

| Rank | Plugin | Downloads | Category | Relevance to Outline |
|------|--------|-----------|----------|---------------------|
| 1 | **Excalidraw** | 1,780,406 | Visual/Drawing | Low -- spatial drawing is outside Outline's scope |
| 2 | **Templater** | 1,405,280 | Automation | Medium -- templates reduce friction for repetitive structures |
| 3 | **Dataview** | 1,112,084 | Query/Metadata | High -- users want structured views over their data |
| 4 | **Tasks** | 1,023,697 | Task Management | High -- validates demand for integrated task features |
| 5 | **Git** | 699,981 | Version Control | Low -- Outline uses file sync, not git |
| 6 | **Calendar** | 690,796 | Date Navigation | High -- validates Outline's date views panel approach |
| 7 | **Style Settings** | 616,437 | Theming | Low -- cosmetic customization |
| 8 | **Copilot** | 587,219 | AI | Low -- AI integration is orthogonal |
| 9 | **Remotely Save** | 578,974 | Sync | Medium -- shows pain with native sync |
| 10 | **Advanced Tables** | ~500,000 | Editing | Low -- table editing is outside outliner scope |
| 11 | **Kanban** | ~450,000 | Project Management | Medium -- visual project management |
| 12 | **Periodic Notes** | ~400,000 | Journaling | Medium -- daily/weekly note templates |
| 13 | **Obsidian Linter** | ~380,000 | Formatting | Low -- Markdown formatting consistency |
| 14 | **Advanced Canvas** | ~350,000 | Visual | Low -- spatial organization |
| 15 | **Day Planner** | ~300,000 | Scheduling | High -- time-based planning views |
| 16 | **Checklist** | ~280,000 | Tasks | High -- task aggregation across notes |
| 17 | **Outliner** | ~260,000 | Outlining | High -- adds outliner behavior to Obsidian |
| 18 | **Natural Language Dates** | ~250,000 | Dates | High -- already built into Outline |
| 19 | **Full Calendar** | ~240,000 | Calendar | High -- calendar views of dated content |
| 20 | **Quick Add** | ~230,000 | Capture | High -- fast capture without friction |

### What the Plugin Ecosystem Reveals

The plugin download data tells a clear story about what Obsidian's core lacks:

1. **Task management is not built-in.** The Tasks plugin (1M+ downloads) and Checklist plugin exist because Obsidian's native checkbox support is minimal -- no due dates, no recurrence, no aggregated task views. Outline handles this natively with checkboxes, inline dates, recurrence rules, and the date views panel.

2. **Users want structured metadata queries.** Dataview (1.1M downloads) is the third most popular plugin because users want to treat their notes as a database -- filter by tags, dates, properties, and status. This is the biggest gap Outline should monitor. Purpose-built views (date views, tag views, saved searches) cover most of this need without the complexity.

3. **Calendar/date views are essential.** Calendar (690K), Day Planner, Full Calendar, and Periodic Notes collectively represent massive demand for temporal organization. Outline's date views panel and iCal integration already address this natively.

4. **Templates reduce friction.** Templater (1.4M downloads) shows users want to quickly create structured content from patterns. Outline has no template system.

5. **Obsidian users want outliner behavior.** The Outliner plugin (260K downloads) adds Dynalist/Workflowy-style keyboard shortcuts and behaviors to Obsidian. This validates that outlining is a sought-after workflow that Obsidian does not natively support well.

6. **Quick capture matters.** QuickAdd (230K) exists because Obsidian's note creation has friction -- choosing a folder, naming a file. Outline's inbox capture (via thin server API) addresses this for mobile, but desktop capture could be smoother.

---

## Feature-by-Feature Comparison

### 1. Linking and Backlinks

**Obsidian**: Full `[[wikilink]]` support with several advanced features:
- **Aliases**: Notes can define alternative names in YAML frontmatter. Typing `[[` triggers autocomplete that matches both filenames and aliases.
- **Link display text**: `[[note|display text]]` syntax for custom link labels.
- **Unlinked mentions**: The backlinks pane has a second section showing occurrences of the note's name (or aliases) in other notes where no explicit link exists. Users can click to convert unlinked mentions into links.
- **Backlinks pane**: Shows all notes that link to the current note, with surrounding context.
- **Outgoing links pane**: Shows all links from the current note.

**Outline**: Wiki links `[[document name]]` with backlinks panel in the sidebar. Links target documents. No unlinked mentions feature. No alias support.

**Assessment**: Obsidian's linking is more mature. The alias system is particularly useful for notes with long names or multiple common names. Unlinked mentions are a low-cost discovery feature that surfaces implicit connections. However, Obsidian links target files (pages), not blocks -- the same granularity limitation as Outline's document-level links.

**Recommendation**:
- **Unlinked mentions** (high priority): Surface nodes containing a document's name without explicit `[[links]]`. This is the most impactful linking feature Outline lacks.
- **Link aliases** (medium priority): Allow documents to have alternative names for linking. Useful for abbreviations and synonyms.

---

### 2. Graph View

**Obsidian**: Both local (connections from current note) and global (entire vault) force-directed graph views. Nodes are color-coded by folder or tag. Interactive -- clicking navigates to the note. Supports filtering by path, tag, or search query.

**Outline**: No graph view. Navigation via sidebar document tree, search, wiki links, and backlinks panel.

**Assessment**: The graph view is Obsidian's signature visual feature and a major marketing asset. However, practical utility is widely debated in the Obsidian community. Common criticisms:
- Becomes an unreadable "hairball" with more than a few hundred notes
- Most experienced users report using it for occasional exploration or aesthetics, not daily work
- The local graph (showing connections from one note) is more useful than the global graph
- Community threads frequently ask "What's the point of the graph view?" with mixed answers

The graph is visually impressive in demos and screenshots, contributing to Obsidian's viral marketing. Its practical value for daily work is limited.

**Recommendation**: Skip graph view. This assessment is consistent with the Logseq competitive analysis. The backlinks panel and search provide more actionable navigation. If visualization is ever desired, a focused "link neighborhood" view (connections 1-2 hops from current document) would deliver more practical value.

---

### 3. Canvas

**Obsidian**: An infinite spatial canvas (introduced v1.1.0) where users can:
- Place notes, images, PDFs, videos, and web pages as cards
- Draw connections between cards
- Group cards into colored regions
- Embed live note content (editable within the canvas)
- Create standalone text cards (not linked to any note)
- Pan and zoom infinitely

Canvas is stored as a `.canvas` JSON file within the vault.

**Outline**: No spatial/visual organization features.

**Assessment**: Canvas serves a different modality -- spatial/visual thinking vs. hierarchical/textual thinking. Use cases include brainstorming, project planning, research mapping, and dashboard-like overviews. The Advanced Canvas plugin (350K downloads) further extends this with presentations and flowcharts.

Canvas is compelling but represents a significant departure from outliner workflows. Hierarchical outliners and spatial canvases serve different cognitive modes. Adding spatial features would dilute Outline's focus on structured hierarchical thinking.

**Recommendation**: Skip Canvas. The development cost is high and the use case diverges from Outline's core outliner identity. Users who need spatial organization can use dedicated tools (Excalidraw, Miro, FigJam) alongside Outline.

---

### 4. Templates and Templater

**Obsidian Core Templates**: Basic variable substitution -- insert date, time, and title into a template note.

**Templater Plugin** (1.4M downloads): Dramatically extends templates with:
- JavaScript execution within templates
- User prompts (text input, selection, date picker) during template insertion
- Dynamic content generation (dates, calculations, API calls)
- Auto-apply templates on note creation based on folder
- Cursor placement after template insertion

Common Templater use cases: daily note templates with standard sections, meeting note templates with date/attendee prompts, project templates with predefined structure, and recurring checklists.

**Outline**: No template system. Each new node starts blank.

**Assessment**: The popularity of Templater (1.4M downloads, second most popular plugin) indicates strong demand for reducing friction in creating structured content. For an outliner, templates could mean: predefined node hierarchies (e.g., a "weekly review" checklist), document templates (e.g., "project" with standard sections), or snippet expansion within nodes.

**Recommendation**: Consider a lightweight template system (medium priority):
- **Document templates**: Pre-defined node hierarchies that can be instantiated as new documents. Simpler than Templater -- no JavaScript execution needed.
- **Node snippets**: Type a trigger (e.g., `/meeting`) to expand a predefined node hierarchy inline. Similar to TipTap's slash commands.

This does not need the complexity of Templater's JavaScript engine. Static templates with date variable substitution would cover most use cases.

---

### 5. Dataview Plugin

**Dataview** (1.1M downloads) turns an Obsidian vault into a queryable database:

```
TABLE file.ctime AS "Created", status, priority
FROM #project
WHERE status != "done"
SORT priority ASC
```

Features:
- SQL-like query language (DQL) for filtering, sorting, and grouping notes
- Inline queries for simple aggregations
- JavaScript API for complex queries
- Queries over YAML frontmatter metadata, tags, links, dates
- Results rendered as tables, lists, or task lists
- Live updates as notes change

**Outline**: Full-text search via SQLite FTS5. Date views panel. Tag filtering. No embedded query blocks or metadata-based filtering.

**Assessment**: Dataview's popularity reveals the #1 unmet need in the personal knowledge management space: **users want structured views over their data without building a separate database.** People want to ask "show me all tasks tagged #work due this week" or "list all meeting notes from January sorted by project."

However, Dataview has significant downsides:
- Steep learning curve (SQL-like syntax is not intuitive for non-developers)
- Queries break when note structure changes
- Performance degrades with large vaults
- Creates vendor lock-in (queries are Obsidian-specific, not portable)

Outline's purpose-built views (date views, tag panel, search) cover the most common query patterns without requiring users to write query syntax.

**Recommendation**: Do not replicate Dataview's query language. Instead, continue building purpose-built views that cover the high-value query patterns:
- Date views panel (already implemented) -- covers "show me items due this week"
- Tag panel (already implemented) -- covers "show me all items tagged X"
- **Saved/filtered searches** (new, high priority): Persist search queries with filters (tag, date range, checked/unchecked, color) as named views in the sidebar. This covers 80% of Dataview's use cases with zero learning curve.
- **Cross-document task view** (new, medium priority): Aggregate all unchecked items with dates across all documents into a single view. The most common Dataview query pattern.

---

### 6. Tasks Plugin

**Obsidian Tasks Plugin** (1M+ downloads): A comprehensive task management system layered on top of Obsidian's basic checkbox syntax:

- Due dates, scheduled dates, start dates, created dates, done dates
- Recurring tasks with natural language recurrence rules
- Priority levels (highest, high, medium, low, lowest)
- Query language for building task dashboards:
  ```
  not done
  due before next monday
  tags include #work
  sort by due
  ```
- Global task aggregation across all notes
- Task status cycling (todo -> in progress -> done)
- Auto-delete completed recurring tasks

**Outline**: Built-in checkbox nodes with inline dates and recurrence rules. Date views panel aggregates dated items. Binary checked/unchecked state.

**Assessment**: The Tasks plugin's 1M+ downloads prove that task management is a primary use case for personal knowledge tools, and that Obsidian's native checkboxes are insufficient. Outline already has most of the Tasks plugin's functionality built in natively:

| Feature | Obsidian + Tasks Plugin | Outline |
|---------|------------------------|---------|
| Checkboxes | Native + plugin | Native |
| Due dates | Plugin (emoji syntax) | Native (inline date picker) |
| Recurrence | Plugin | Native (RRule) |
| Date aggregation | Plugin (query blocks) | Native (date views panel) |
| Priority | Plugin (emoji markers) | Not implemented |
| Task states | Plugin (todo/doing/done) | Binary (checked/unchecked) |
| Cross-doc task view | Plugin (query blocks) | Partially (date views shows dated items) |
| iCal output | Not available | Native (thin server) |

Outline is already ahead of Obsidian's native task support and competitive with the Tasks plugin. The key gaps are:
- **Task states beyond binary**: The Tasks plugin offers todo/in-progress/done cycling. Outline has only checked/unchecked.
- **Cross-document task aggregation**: The Tasks plugin can show all tasks from all notes matching criteria. Outline's date views shows dated items but has no "all tasks" view independent of dates.

**Recommendation**:
- **Task states** (medium priority): Add at least an "in progress" state (three-state cycling: unchecked -> in progress -> checked). Already recommended in the Logseq analysis.
- **All tasks view** (medium priority): A view showing all unchecked checkboxes across all documents, filterable by tag and date.

---

### 7. Local-First Philosophy

**Obsidian**: Files are plain Markdown stored in a local folder ("vault"). No account required. No telemetry. Data never leaves your machine unless you use Obsidian Sync or a third-party sync tool. The app is free for personal use.

**Outline**: JSONL files stored in `~/.outline-data/`. No account, no telemetry. Data is local. Sync via Dropbox/Syncthing.

**Assessment**: Both tools are genuinely local-first with strong data ownership. Key differences:

| Aspect | Obsidian | Outline |
|--------|----------|---------|
| **File format** | Plain Markdown (human-readable, universal) | JSONL (structured, machine-friendly) |
| **Portability** | Excellent -- files work in any text editor | Good -- JSONL is readable but specific to Outline |
| **Interoperability** | Markdown ecosystem (Pandoc, static site generators, etc.) | Export required for other tools |
| **Metadata storage** | YAML frontmatter (standardized) | Embedded in node fields (proprietary) |
| **Sync options** | iCloud, Dropbox, Syncthing, Git, Obsidian Sync ($4-8/mo) | Dropbox, Syncthing, Nextcloud |

Obsidian's Markdown-based approach has a portability advantage: if Obsidian disappears, your notes are still plain text files. Outline's JSONL format is structured and robust for programmatic access but requires export to be useful outside Outline.

However, Outline's JSONL approach has significant technical advantages for sync:
- Append-only operation logs naturally handle multi-machine conflicts
- Per-machine pending files prevent merge conflicts
- Compaction merges state deterministically
- No risk of Markdown parsing inconsistencies

Obsidian's Markdown sync is fragile -- file sync services (iCloud, Dropbox) can corrupt files during concurrent edits, and community reports of data loss with iCloud sync are common. Obsidian Sync ($4-8/mo) solves this with end-to-end encrypted sync, but it is a paid service.

**Recommendation**: No change needed. Outline's sync architecture is technically superior for multi-machine workflows. The tradeoff of less human-readable files for more reliable sync is worthwhile. Consider adding a Markdown export feature for portability insurance.

---

### 8. Sync and Publish

**Obsidian Sync** ($4-8/month):
- End-to-end encrypted (AES-256)
- Version history (1 month on basic, longer on Plus)
- Selective sync (choose which folders/files)
- Unlimited devices
- 1GB storage (basic) or 10GB (Plus)
- Fast and reliable per community reports

**Obsidian Publish** ($8/month):
- Publish selected notes as a website
- Custom domain support
- Password protection
- Graph view on published site
- Search on published site

**Outline**: Sync via existing file sync tools (Dropbox, Syncthing, Nextcloud). No paid sync service. Thin server provides read-only viewing and iCal feed.

**Assessment**: Obsidian's Sync service solves the real pain point of multi-device file sync for Markdown files. The $4-8/month price is considered expensive by some community members, but the service is reliable and encrypted. Many users opt for free alternatives (iCloud Drive, Syncthing, Git).

Obsidian Publish is a niche feature for sharing knowledge publicly. It generates recurring revenue for Obsidian but is not relevant to Outline's personal use case.

Outline's approach of delegating sync to Dropbox/Syncthing avoids vendor lock-in and recurring costs. The JSONL format handles sync conflicts better than plain Markdown files.

**Recommendation**: No change needed. Outline's sync-agnostic approach is a strength. The thin server provides the "publish" equivalent (read-only viewer) without a paid service.

---

### 9. Mobile App

**Obsidian Mobile**: Full-featured app for iOS and Android:
- Complete editor with all formatting options
- Community plugins work on mobile
- Graph view on mobile
- Canvas on mobile
- Full vault access
- Offline capable
- Touch-optimized toolbar

**Outline**: Mobile capture form via thin server (`/outline/capture`). POST to inbox API. No editing, no browsing.

**Assessment**: This is Obsidian's biggest advantage over Outline for mobile users. Obsidian's mobile app is essentially the full desktop app on a phone, while Outline is capture-only on mobile. For users who want to review, edit, or browse their outline on mobile, Obsidian provides a dramatically better experience.

However, building a full mobile editor is a massive engineering effort. For a personal tool, the thin server capture form may be sufficient if the primary editing workflow is desktop-based.

**Recommendation**: Mobile is Outline's largest feature gap versus Obsidian. Possible approaches in priority order:
1. **Improve the mobile capture form** (low effort): Add tags, date selection, and target document selection to the capture form.
2. **Mobile-friendly read-only viewer** (medium effort): Make the thin server's viewer.html responsive and touch-friendly for browsing on mobile.
3. **Full mobile app** (high effort, long-term): A Tauri mobile build or progressive web app. Only justified if mobile editing becomes a core requirement.

---

### 10. Theming and CSS Customization

**Obsidian**: Extensive theming system:
- Light and dark mode built in
- Community theme marketplace (200+ themes)
- Full CSS customization via `snippets` folder
- Style Settings plugin (616K downloads) provides GUI toggles for theme options
- Accent color picker
- Font customization

**Outline**: Light and dark themes. No CSS customization.

**Assessment**: Theming is important for personal tools people use daily. Obsidian's theme marketplace creates community engagement and personal investment in the tool. However, maintaining a theme ecosystem requires API stability commitments that constrain UI evolution.

**Recommendation**: Low priority. Add basic customization (accent color, font choice) if there is demand. A full theme marketplace is overkill for a personal tool.

---

## What Outline Does Better

### 1. Hierarchical Structure as a First-Class Concept
Obsidian is page-centric -- creating nested structure requires links between separate files or indentation within a note. There is no native concept of a tree of items that can be indented, outdented, reordered, and collapsed. The Outliner plugin (260K downloads) exists specifically to add this behavior. Outline provides this natively with polished keyboard interactions.

### 2. Integrated Task and Date Management
Obsidian requires the Tasks plugin (1M+ downloads) for dates, recurrence, and task aggregation. Outline builds this into the core -- inline date picker, RRule recurrence, date views panel, and iCal feed output. No plugins needed.

### 3. iCalendar Integration
Outline's thin server generates iCal feeds subscribable in Google Calendar, Apple Calendar, etc. Obsidian has no equivalent. Users must manually check their vault or use third-party calendar plugins.

### 4. Single-App Simplicity vs. Plugin Dependency
Obsidian's power comes from its plugin ecosystem, but this creates fragility:
- Plugins break between Obsidian versions
- Plugin quality varies (community-maintained, no guarantees)
- Security risks (plugins have full vault access)
- Inconsistent UX across plugins
- Onboarding friction (new users must discover and configure plugins)

Outline's integrated approach means every feature works together reliably without configuration.

### 5. Performance
Tauri 2 (Rust backend, system webview) is fundamentally lighter than Obsidian's Electron-based architecture. Outline has faster startup, lower memory usage, and smoother editing for large documents.

### 6. Sync Reliability
Outline's JSONL append-only log with per-machine pending files is purpose-built for multi-machine sync. Obsidian's file-based sync via iCloud/Dropbox is notoriously fragile -- community reports of data loss and file conflicts are common.

### 7. Keyboard-First Outliner UX
Arrow key navigation, Tab/Shift-Tab for indent/outdent, drag-and-drop, and all the Dynalist/Workflowy interactions are native. Obsidian approximates these only with plugins.

---

## What Obsidian Does Better

### 1. Plugin Ecosystem and Community
2,700+ community plugins create a self-reinforcing ecosystem. Users can build nearly any workflow. The community produces tutorials, templates, and shared configurations. This is Obsidian's primary competitive moat.

### 2. Mobile Experience
A full-featured mobile app vs. Outline's capture-only form. This is the single largest feature gap.

### 3. File Portability
Plain Markdown files are universally readable and interoperable. If Obsidian disappears, the notes remain useful. Outline's JSONL format requires export.

### 4. Unlinked Mentions
Passive discovery of connections without explicit linking. A low-cost, high-value feature.

### 5. Aliases and Link Flexibility
Notes can have multiple names for linking. Link display text can differ from the target. These quality-of-life features reduce linking friction.

### 6. Visual Thinking (Canvas/Excalidraw)
Spatial organization modalities that Outline does not offer. Relevant for brainstorming and planning workflows.

### 7. Templates
Reducing friction for repetitive structures. Obsidian's Templater is overpowered (JavaScript execution) but the core need -- predefined structures -- is valid.

---

## Features to Adopt

### High Priority

| Feature | Why | Implementation Approach |
|---------|-----|------------------------|
| **Unlinked mentions** | Low-cost discovery. Surfaces implicit connections. 3rd analysis recommending this. | Scan nodes for document names without `[[]]` wrapping. Show in backlinks panel as a secondary section. |
| **Saved/filtered searches** | Covers 80% of Dataview's use cases with zero learning curve. | Persist search queries with filters (tag, date range, checked/unchecked) as named views in the sidebar. |
| **Mobile capture improvements** | Narrow the mobile gap cheaply. | Add tags, date selection, and target document to the capture form. |

### Medium Priority

| Feature | Why | Implementation Approach |
|---------|-----|------------------------|
| **Document templates** | Templater's 1.4M downloads prove demand. Reduces friction for repetitive structures. | Pre-defined node hierarchies instantiated as new documents. No scripting needed -- static templates with date variables. |
| **Task states** | Binary checkbox is limiting. Tasks plugin offers todo/doing/done. | Three-state cycling: unchecked -> in progress -> checked. Visual indicator for in-progress state. |
| **All tasks view** | Cross-document task aggregation is the most common Dataview/Tasks query. | View showing all unchecked checkboxes across documents, filterable by tag and date. |
| **Link aliases** | Reduce linking friction for documents with long or multiple names. | Allow documents to define alternative names in metadata. Autocomplete matches aliases. |

### Low Priority (Monitor, Do Not Build)

| Feature | Reason to Skip |
|---------|---------------|
| **Graph view** | Impressive demo, low practical value. 3rd analysis confirming this. |
| **Plugin system** | Creates fragility, security risks, inconsistent UX. Outline's integrated approach is a strength. |
| **Canvas/spatial organization** | Different cognitive modality. High dev cost, outside outliner scope. |
| **Full CSS theming** | Overkill for personal tool. Basic customization (accent color, fonts) is sufficient. |
| **Dataview-style query language** | Steep learning curve. Purpose-built views are more accessible. |
| **Obsidian Publish equivalent** | Thin server viewer already provides read-only access. |

---

## Architectural Lessons

1. **Obsidian's plugin ecosystem is a double-edged sword.** It creates massive community engagement and fills feature gaps, but also creates fragility, security risks, and an inconsistent experience. The top plugins (Tasks, Dataview, Calendar, Outliner) exist because Obsidian's core lacks features that Outline builds in natively. Outline should not build a plugin system but should monitor popular plugins to identify features worth integrating.

2. **Markdown portability vs. sync robustness is a real tradeoff.** Obsidian chose human-readable Markdown at the cost of sync reliability. Outline chose structured JSONL at the cost of interoperability. Both are valid choices. Outline should invest in good export (Markdown, OPML) to mitigate the portability disadvantage.

3. **The Outliner plugin's popularity validates Outline's core bet.** 260K Obsidian users downloaded a plugin specifically to get Dynalist/Workflowy-style outliner behavior. This confirms that hierarchical outlining is a desired workflow that page-centric tools do not natively support well.

4. **Dataview's popularity is the strongest signal in the ecosystem.** 1.1M downloads for a plugin that turns notes into a queryable database. Users want structured views over their data. Outline should address this with saved searches and purpose-built views, not a query language.

5. **Mobile is the largest gap.** Obsidian's full mobile app vs. Outline's capture form is the most significant difference in daily usability. Improving the mobile capture form and adding a responsive read-only viewer are the highest-ROI mobile investments.

---

## Summary

Obsidian and Outline serve overlapping but distinct user needs. Obsidian is a general-purpose knowledge management platform that becomes powerful through plugin configuration. Outline is a focused hierarchical outliner with integrated task management and calendar output.

Obsidian's ecosystem breadth (2,700+ plugins, 200+ themes, active community) is its primary competitive advantage and something a personal tool cannot replicate. However, Outline's integrated approach produces a more reliable, performant, and cohesive experience for its core use case of structured thinking and task management.

The most actionable takeaways are:
1. **Unlinked mentions** for passive link discovery (consistently recommended across competitive analyses)
2. **Saved/filtered searches** to address the Dataview-shaped gap without query language complexity
3. **Mobile capture improvements** to narrow the largest feature gap cheaply
4. **Document templates** to address the Templater-shaped gap with minimal complexity
5. **Task states beyond binary** to match the Tasks plugin's expressiveness

Obsidian's plugin ecosystem reveals user needs; Outline should address those needs with integrated features, not a plugin system.
