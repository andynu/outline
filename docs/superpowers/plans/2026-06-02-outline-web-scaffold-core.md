# outline-web Scaffold + Core (Phase 0+1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `outline-web` Rails server — a single-user, token-authenticated HTTP API over a SQLite-backed outline data model — with the node/tree/op/search logic faithfully ported from the Rust `outline-core` crate.

**Architecture:** Rails 8.1 API + minimal session UI, SQLite persistence via ActiveRecord. Nodes form a tree with integer sibling ordering; `Move` is a distinct server-owned operation that reindexes siblings and enforces tree invariants in a transaction. A batch `POST /ops` endpoint replays Create/Update/Move/Delete ops all-or-nothing. FTS5 backs search and backlinks. Auth is a single personal access token (Bearer) for the API plus a password session for the future web UI.

**Tech Stack:** Ruby 3.3+, Rails 8.1.x, SQLite (with FTS5), minitest, Propshaft (Rails assets only), nginx + Passenger (deploy). React/Vite UI is a later phase.

**Reference source (read-only oracle):** the existing Rust crate at `app/src-tauri/crates/outline-core/src/` in the sibling `outline` repo — `data/node.rs`, `data/operations.rs`, `data/short_ids.rs`, `search/mod.rs`, and their `#[cfg(test)]` blocks. Port the *behavior and test cases*, not the code.

---

## Conventions (read before Task 1)

- **Primary keys are client-supplied UUID strings** for `nodes`, `documents`, `folders` (matches Rust `Uuid`; the client generates IDs and `mirror_source_id` references them). Use `create_table …, id: :string` and a `before_create` that fills a UUID if blank. Bookmarks/capture_targets/custom_emoji may use default integer PKs.
- **Migrations are DDL-only.** Any data backfill is a separate rake task.
- **DB-layer constraints:** NOT NULL, foreign keys (`foreign_key: true`), and check constraints where the spec implies them. Validations document intent; the DB enforces.
- **Dates are strings**, not Rails datetimes, for `date`, `date_recurrence`, `recurrence_mode`, `date_end`, `defer_date`.
- **`== null` analog:** in Ruby, treat missing/`nil` uniformly; serialize omitted optionals as absent keys to mirror the Rust `skip_serializing_if`.
- **Run `bin/rails test` before every commit.** Never commit on red.
- **Commit `.beads/issues.jsonl` alongside related code** when bd is in use.

### File structure (locked here)

```
outline-web/
  app/
    controllers/
      api/
        base_controller.rb         # token auth, error rendering
        nodes_controller.rb         # create/update/destroy/move
        ops_controller.rb           # batch POST /ops
        documents_controller.rb
        folders_controller.rb
        bookmarks_controller.rb
        search_controller.rb        # search/backlinks/unlinked/dated
    models/
      node.rb                       # tree, ordering, validations
      document.rb
      folder.rb
      bookmark.rb
      capture_target.rb
      custom_emoji.rb
      access_token.rb
      concerns/
        short_id_generator.rb       # short_id assignment per doc_prefix
    services/
      node_mover.rb                 # reindex + invariant enforcement
      op_applier.rb                 # apply one op; used by ops batch
      node_search.rb                # FTS5 query, backlinks, unlinked refs
  db/migrate/…
  config/routes.rb
  test/
    models/… controllers/… services/…
    test_helper.rb
```

---

## Task 1: Rails app scaffold

**Files:**
- Create: entire `outline-web/` Rails skeleton
- Create: `outline-web/.beads/` (bd init)

- [ ] **Step 1: Generate the app**

```bash
gem install rails -v '~> 8.1.0'
rails _8.1.0_ new outline-web --database=sqlite3 --skip-jbuilder --asset-pipeline=propshaft --skip-action-mailbox --skip-action-text
cd outline-web
git init && git add -A && git commit -q -m "chore: rails 8.1 scaffold"
```

- [ ] **Step 2: Initialize beads**

```bash
bd init   # or follow ~/prompts/beads-setup.md if init is unavailable
git add .beads && git commit -q -m "chore: init beads"
```

- [ ] **Step 3: Add minitest sanity test and run it**

Rails ships minitest. Verify the harness:

Run: `bin/rails test`
Expected: PASS (0 failures; default tests or none).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -q -m "chore: confirm test harness"
```

---

## Task 2: Single-user access token model + Bearer auth

**Files:**
- Create: `db/migrate/<ts>_create_access_tokens.rb`
- Create: `app/models/access_token.rb`
- Create: `app/controllers/api/base_controller.rb`
- Test: `test/models/access_token_test.rb`, `test/controllers/api/base_controller_test.rb`

- [ ] **Step 1: Write the failing model test**

```ruby
# test/models/access_token_test.rb
require "test_helper"

class AccessTokenTest < ActiveSupport::TestCase
  test "generate creates a token with a 64-char hex secret" do
    t = AccessToken.generate!(label: "cli")
    assert_equal 64, t.secret.length
    assert_match(/\A[0-9a-f]+\z/, t.secret)
  end

  test "authenticate returns the token for a valid secret" do
    t = AccessToken.generate!(label: "cli")
    assert_equal t, AccessToken.authenticate(t.secret)
  end

  test "authenticate returns nil for an unknown secret" do
    assert_nil AccessToken.authenticate("deadbeef")
  end
end
```

- [ ] **Step 2: Run it, expect failure**

Run: `bin/rails test test/models/access_token_test.rb`
Expected: FAIL — `uninitialized constant AccessToken`.

- [ ] **Step 3: Migration + model**

```ruby
# db/migrate/<ts>_create_access_tokens.rb
class CreateAccessTokens < ActiveRecord::Migration[8.1]
  def change
    create_table :access_tokens do |t|
      t.string :label, null: false
      t.string :secret, null: false
      t.timestamps
    end
    add_index :access_tokens, :secret, unique: true
  end
end
```

```ruby
# app/models/access_token.rb
require "securerandom"

class AccessToken < ApplicationRecord
  validates :label, :secret, presence: true

  def self.generate!(label:)
    create!(label: label, secret: SecureRandom.hex(32))
  end

  def self.authenticate(secret)
    return nil if secret.blank?
    find_by(secret: secret)
  end
end
```

Run: `bin/rails db:migrate`

- [ ] **Step 4: Run model test, expect pass**

Run: `bin/rails test test/models/access_token_test.rb`
Expected: PASS.

- [ ] **Step 5: Write the failing controller auth test**

```ruby
# test/controllers/api/base_controller_test.rb
require "test_helper"

class Api::BaseControllerTest < ActionDispatch::IntegrationTest
  # A tiny probe action mounted only in the test env would be ideal, but we can
  # exercise auth through a real endpoint once it exists. For now, assert the
  # concern rejects missing tokens via the documents index (Task 7) — until then,
  # test the helper directly:
  test "bearer token is extracted from the Authorization header" do
    token = AccessToken.generate!(label: "t")
    controller = Api::BaseController.new
    request = ActionDispatch::TestRequest.create
    request.headers["Authorization"] = "Bearer #{token.secret}"
    controller.set_request!(request) if controller.respond_to?(:set_request!)
    assert_equal token, Api::BaseController.token_from_header(request.headers["Authorization"])
  end
end
```

- [ ] **Step 6: Run it, expect failure**

Run: `bin/rails test test/controllers/api/base_controller_test.rb`
Expected: FAIL — `NoMethodError: token_from_header`.

- [ ] **Step 7: Implement the base controller**

```ruby
# app/controllers/api/base_controller.rb
class Api::BaseController < ActionController::API
  before_action :authenticate_token!

  rescue_from ActiveRecord::RecordNotFound do |e|
    render_error(:not_found, e.message)
  end
  rescue_from ActiveRecord::RecordInvalid do |e|
    render_error(:unprocessable_entity, e.record.errors.full_messages.join(", "))
  end

  def self.token_from_header(header)
    return nil if header.blank?
    scheme, secret = header.split(" ", 2)
    return nil unless scheme == "Bearer"
    AccessToken.authenticate(secret)
  end

  private

  def authenticate_token!
    @current_token = self.class.token_from_header(request.headers["Authorization"])
    render_error(:unauthorized, "invalid or missing token") unless @current_token
  end

  def render_error(status, message, extra = {})
    render json: { error: message }.merge(extra), status: status
  end
end
```

- [ ] **Step 8: Run it, expect pass**

Run: `bin/rails test test/controllers/api/base_controller_test.rb`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: access token model + Bearer auth base controller"
```

---

## Task 3: Folder model

**Files:**
- Create: `db/migrate/<ts>_create_folders.rb`, `app/models/folder.rb`
- Test: `test/models/folder_test.rb`

- [ ] **Step 1: Failing test**

```ruby
# test/models/folder_test.rb
require "test_helper"

class FolderTest < ActiveSupport::TestCase
  test "requires a name" do
    assert_not Folder.new(position: 0).valid?
  end

  test "gets a uuid id on create" do
    f = Folder.create!(name: "Work", position: 0)
    assert_match(/\A[0-9a-f-]{36}\z/, f.id)
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/models/folder_test.rb`
Expected: FAIL — `uninitialized constant Folder`.

- [ ] **Step 3: Migration + model**

```ruby
# db/migrate/<ts>_create_folders.rb
class CreateFolders < ActiveRecord::Migration[8.1]
  def change
    create_table :folders, id: :string do |t|
      t.string :name, null: false
      t.integer :position, null: false, default: 0
      t.timestamps
    end
  end
end
```

```ruby
# app/models/folder.rb
require "securerandom"

class Folder < ApplicationRecord
  has_many :documents, dependent: :nullify
  validates :name, presence: true
  before_create { self.id = SecureRandom.uuid if id.blank? }
end
```

Run: `bin/rails db:migrate`

- [ ] **Step 4: Run, expect pass**

Run: `bin/rails test test/models/folder_test.rb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Folder model"
```

---

## Task 4: Document model + short_id generator concern

**Files:**
- Create: `db/migrate/<ts>_create_documents.rb`, `app/models/document.rb`
- Create: `app/models/concerns/short_id_generator.rb`
- Test: `test/models/document_test.rb`

Reference: `data/short_ids.rs` (4-char base36 unique per doc).

- [ ] **Step 1: Failing test**

```ruby
# test/models/document_test.rb
require "test_helper"

class DocumentTest < ActiveSupport::TestCase
  test "requires name and doc_prefix" do
    assert_not Document.new.valid?
  end

  test "uuid id and optional folder" do
    d = Document.create!(name: "Outline", doc_prefix: "outline", position: 0)
    assert_match(/\A[0-9a-f-]{36}\z/, d.id)
    assert_nil d.folder_id
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/models/document_test.rb`
Expected: FAIL — `uninitialized constant Document`.

- [ ] **Step 3: Migration + model**

```ruby
# db/migrate/<ts>_create_documents.rb
class CreateDocuments < ActiveRecord::Migration[8.1]
  def change
    create_table :documents, id: :string do |t|
      t.string :name, null: false
      t.string :doc_prefix, null: false
      t.references :folder, type: :string, foreign_key: true, null: true
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :documents, :doc_prefix, unique: true
  end
end
```

```ruby
# app/models/document.rb
require "securerandom"

class Document < ApplicationRecord
  belongs_to :folder, optional: true
  has_many :nodes, dependent: :destroy
  validates :name, :doc_prefix, presence: true
  validates :doc_prefix, uniqueness: true
  before_create { self.id = SecureRandom.uuid if id.blank? }
end
```

Run: `bin/rails db:migrate`

- [ ] **Step 4: Run, expect pass**

Run: `bin/rails test test/models/document_test.rb`
Expected: PASS.

- [ ] **Step 5: Write short_id generator concern with a failing test**

```ruby
# test/models/concerns/short_id_generator_test.rb
require "test_helper"

class ShortIdGeneratorTest < ActiveSupport::TestCase
  setup { @doc = Document.create!(name: "Outline", doc_prefix: "outline", position: 0) }

  test "assigns a 4-char base36 short_id scoped to the document" do
    n = Node.create!(document: @doc, content: "hi", position: 0)
    assert_match(/\A[0-9a-z]{4}\z/, n.short_id)
  end

  test "short_ids are unique within a document" do
    ids = 50.times.map { Node.create!(document: @doc, content: "x", position: 0).short_id }
    assert_equal ids.uniq.length, ids.length
  end
end
```

(This test depends on Node from Task 5; if running tasks in order, write it now and let it fail until Task 5 lands.)

- [ ] **Step 6: Implement the concern**

```ruby
# app/models/concerns/short_id_generator.rb
module ShortIdGenerator
  extend ActiveSupport::Concern

  ALPHABET = ("0".."9").to_a + ("a".."z").to_a # base36

  included do
    before_create :assign_short_id, unless: -> { short_id.present? }
  end

  private

  def assign_short_id
    scope = self.class.where(document_id: document_id)
    loop do
      candidate = Array.new(4) { ALPHABET.sample }.join
      unless scope.exists?(short_id: candidate)
        self.short_id = candidate
        break
      end
    end
  end
end
```

- [ ] **Step 7: Run (after Task 5) and commit**

Run: `bin/rails test test/models/document_test.rb test/models/concerns/short_id_generator_test.rb`
Expected: PASS once Node exists.

```bash
git add -A && git commit -m "feat: Document model + short_id generator concern"
```

---

## Task 5: Node model (schema, defaults, validations)

**Files:**
- Create: `db/migrate/<ts>_create_nodes.rb`, `app/models/node.rb`
- Test: `test/models/node_test.rb`

Reference: `data/node.rs` `Node` struct + `NodeType`.

- [ ] **Step 1: Failing test**

```ruby
# test/models/node_test.rb
require "test_helper"

class NodeTest < ActiveSupport::TestCase
  setup { @doc = Document.create!(name: "Outline", doc_prefix: "outline", position: 0) }

  test "defaults: bullet type, unchecked, not collapsed, empty tags" do
    n = Node.create!(document: @doc, content: "hello", position: 0)
    assert_equal "bullet", n.node_type
    assert_equal false, n.is_checked
    assert_equal false, n.collapsed
    assert_equal [], n.tags
  end

  test "node_type is constrained to the four variants" do
    n = Node.new(document: @doc, content: "x", position: 0, node_type: "banana")
    assert_not n.valid?
  end

  test "tags round-trip as a JSON array" do
    n = Node.create!(document: @doc, content: "x", position: 0, tags: %w[a b])
    assert_equal %w[a b], n.reload.tags
  end

  test "belongs to a document and may have a parent node" do
    parent = Node.create!(document: @doc, content: "p", position: 0)
    child = Node.create!(document: @doc, parent_id: parent.id, content: "c", position: 0)
    assert_equal parent.id, child.parent_id
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/models/node_test.rb`
Expected: FAIL — `uninitialized constant Node`.

- [ ] **Step 3: Migration**

```ruby
# db/migrate/<ts>_create_nodes.rb
class CreateNodes < ActiveRecord::Migration[8.1]
  def change
    create_table :nodes, id: :string do |t|
      t.references :document, type: :string, null: false, foreign_key: true
      t.string  :parent_id            # uuid of parent node, nullable (root)
      t.integer :position, null: false, default: 0
      t.text    :content,  null: false, default: ""
      t.text    :note
      t.string  :node_type, null: false, default: "bullet"
      t.integer :heading_level
      t.boolean :is_checked, null: false, default: false
      t.string  :color
      t.json    :tags, null: false, default: []
      t.string  :date
      t.string  :date_recurrence
      t.string  :recurrence_mode
      t.string  :date_end
      t.string  :defer_date
      t.string  :short_id
      t.boolean :collapsed, null: false, default: false
      t.string  :mirror_source_id
      t.timestamps
    end
    add_index :nodes, [:document_id, :parent_id, :position]
    add_index :nodes, [:document_id, :short_id], unique: true
    add_index :nodes, :parent_id
    add_check_constraint :nodes,
      "node_type IN ('bullet','checkbox','heading','numbered')",
      name: "nodes_node_type_check"
  end
end
```

- [ ] **Step 4: Model**

```ruby
# app/models/node.rb
require "securerandom"

class Node < ApplicationRecord
  include ShortIdGenerator

  NODE_TYPES = %w[bullet checkbox heading numbered].freeze

  belongs_to :document
  belongs_to :parent, class_name: "Node", optional: true,
             primary_key: :id, foreign_key: :parent_id
  has_many :children, class_name: "Node",
           primary_key: :id, foreign_key: :parent_id, dependent: :destroy

  validates :node_type, inclusion: { in: NODE_TYPES }
  validates :content, exclusion: { in: [nil] }

  before_create { self.id = SecureRandom.uuid if id.blank? }

  scope :siblings_of, ->(doc_id, parent_id) {
    where(document_id: doc_id, parent_id: parent_id).order(:position)
  }
end
```

Run: `bin/rails db:migrate`

- [ ] **Step 5: Run, expect pass**

Run: `bin/rails test test/models/node_test.rb`
Expected: PASS. Also re-run Task 4 Step 5 test now (short_id) — expect PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Node model + schema (faithful outline-core port)"
```

---

## Task 6: NodeMover service — sibling reindex + tree invariants

**Files:**
- Create: `app/services/node_mover.rb`
- Test: `test/services/node_mover_test.rb`

Reference: `data/operations.rs` `Move` arm + position handling.

- [ ] **Step 1: Failing test**

```ruby
# test/services/node_mover_test.rb
require "test_helper"

class NodeMoverTest < ActiveSupport::TestCase
  setup do
    @doc = Document.create!(name: "Outline", doc_prefix: "outline", position: 0)
    @a = Node.create!(document: @doc, content: "a", position: 0)
    @b = Node.create!(document: @doc, content: "b", position: 1)
    @c = Node.create!(document: @doc, content: "c", position: 2)
  end

  test "moving c to position 0 shifts a and b down" do
    NodeMover.new(@c).call(parent_id: nil, position: 0)
    assert_equal %w[c a b], roots_in_order
  end

  test "positions are contiguous after a move" do
    NodeMover.new(@a).call(parent_id: nil, position: 2)
    assert_equal [0, 1, 2], Node.siblings_of(@doc.id, nil).pluck(:position)
  end

  test "reparenting into another node updates parent_id and reindexes both sib-sets" do
    NodeMover.new(@a).call(parent_id: @b.id, position: 0)
    assert_equal @b.id, @a.reload.parent_id
    assert_equal %w[b c], roots_in_order            # a left the root set
    assert_equal [0, 1], Node.siblings_of(@doc.id, nil).pluck(:position)
  end

  test "rejects moving a node under its own descendant (cycle)" do
    NodeMover.new(@b).call(parent_id: @a.id, position: 0) # b under a
    assert_raises(NodeMover::InvalidMove) do
      NodeMover.new(@a).call(parent_id: @b.id, position: 0) # a under its child b
    end
  end

  test "rejects a parent in a different document" do
    other = Document.create!(name: "Other", doc_prefix: "other", position: 1)
    foreign = Node.create!(document: other, content: "x", position: 0)
    assert_raises(NodeMover::InvalidMove) do
      NodeMover.new(@a).call(parent_id: foreign.id, position: 0)
    end
  end

  private

  def roots_in_order
    Node.siblings_of(@doc.id, nil).pluck(:content)
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/services/node_mover_test.rb`
Expected: FAIL — `uninitialized constant NodeMover`.

- [ ] **Step 3: Implement**

```ruby
# app/services/node_mover.rb
class NodeMover
  class InvalidMove < StandardError; end

  def initialize(node)
    @node = node
  end

  # Moves @node to the given parent + position, reindexing affected siblings.
  # Returns the reloaded node. Raises InvalidMove on a violated invariant.
  def call(parent_id:, position:)
    Node.transaction do
      validate!(parent_id)
      old_parent = @node.parent_id
      @node.update!(parent_id: parent_id, position: position)
      reindex(old_parent) if old_parent != parent_id
      reindex(parent_id)
      @node.reload
    end
  end

  private

  def validate!(parent_id)
    return if parent_id.nil?
    parent = Node.find_by(id: parent_id)
    raise InvalidMove, "parent not found" unless parent
    raise InvalidMove, "parent in another document" unless parent.document_id == @node.document_id
    raise InvalidMove, "cannot move a node under itself" if parent_id == @node.id
    raise InvalidMove, "cannot move a node under its own descendant" if descendant_ids(@node).include?(parent_id)
  end

  def descendant_ids(node, acc = [])
    kids = Node.where(parent_id: node.id).pluck(:id)
    kids.each { |kid| acc << kid; descendant_ids(Node.new.tap { |n| n.id = kid }, acc) }
    acc
  end

  # Renumber a sibling set to contiguous 0..n-1, honoring current order
  # (the moved node already carries its target position).
  def reindex(parent_id)
    sibs = Node.where(document_id: @node.document_id, parent_id: parent_id)
               .order(:position, :updated_at)
               .to_a
    sibs.each_with_index do |sib, idx|
      sib.update_columns(position: idx) unless sib.position == idx
    end
  end
end
```

- [ ] **Step 4: Run, expect pass**

Run: `bin/rails test test/services/node_mover_test.rb`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: NodeMover (reindex + cycle/cross-doc invariants)"
```

---

## Task 7: OpApplier service — Create/Update/Move/Delete

**Files:**
- Create: `app/services/op_applier.rb`
- Test: `test/services/op_applier_test.rb`

Reference: `data/operations.rs` `Operation` enum + `apply`.

- [ ] **Step 1: Failing test**

```ruby
# test/services/op_applier_test.rb
require "test_helper"

class OpApplierTest < ActiveSupport::TestCase
  setup { @doc = Document.create!(name: "Outline", doc_prefix: "outline", position: 0) }

  test "create op inserts a node with the given id" do
    id = SecureRandom.uuid
    OpApplier.new(@doc).apply!("type" => "create", "id" => id,
                               "content" => "hi", "position" => 0)
    assert Node.exists?(id)
  end

  test "update op applies last-write-wins on updated_at" do
    n = Node.create!(document: @doc, content: "old", position: 0)
    stale = (n.updated_at - 1.hour).iso8601
    OpApplier.new(@doc).apply!("type" => "update", "id" => n.id,
                               "content" => "stale", "updated_at" => stale)
    assert_equal "old", n.reload.content, "stale write must lose to newer updated_at"
  end

  test "delete op removes the node and its subtree" do
    p = Node.create!(document: @doc, content: "p", position: 0)
    Node.create!(document: @doc, parent_id: p.id, content: "c", position: 0)
    OpApplier.new(@doc).apply!("type" => "delete", "id" => p.id)
    assert_equal 0, Node.where(document: @doc).count
  end

  test "move op delegates to NodeMover" do
    a = Node.create!(document: @doc, content: "a", position: 0)
    b = Node.create!(document: @doc, content: "b", position: 1)
    OpApplier.new(@doc).apply!("type" => "move", "id" => b.id,
                               "parent_id" => nil, "position" => 0)
    assert_equal %w[b a], Node.siblings_of(@doc.id, nil).pluck(:content)
  end

  test "unknown op type raises" do
    assert_raises(OpApplier::UnknownOp) { OpApplier.new(@doc).apply!("type" => "frobnicate") }
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/services/op_applier_test.rb`
Expected: FAIL — `uninitialized constant OpApplier`.

- [ ] **Step 3: Implement**

```ruby
# app/services/op_applier.rb
class OpApplier
  class UnknownOp < StandardError; end
  class Conflict < StandardError; end

  UPDATABLE = %w[content note node_type heading_level is_checked color tags
                 date date_recurrence recurrence_mode date_end defer_date
                 collapsed mirror_source_id short_id].freeze

  def initialize(document)
    @document = document
  end

  # Applies a single op (a Hash with a "type"). Raises on invalid input so the
  # caller can roll back a batch. Returns the affected node (or nil for delete).
  def apply!(op)
    case op["type"]
    when "create" then apply_create(op)
    when "update" then apply_update(op)
    when "move"   then apply_move(op)
    when "delete" then apply_delete(op)
    else raise UnknownOp, "unknown op type: #{op["type"].inspect}"
    end
  end

  private

  def apply_create(op)
    attrs = op.slice(*UPDATABLE).merge(
      "id" => op["id"], "parent_id" => op["parent_id"], "position" => op["position"]
    ).compact
    @document.nodes.create!(attrs)
  end

  def apply_update(op)
    node = @document.nodes.find(op["id"])
    if op["updated_at"].present? && Time.parse(op["updated_at"]) < node.updated_at
      Rails.logger.warn(conflict_log(:lww_lose, node, op))
      return node # LWW: incoming write is stale, ignore
    end
    node.update!(op.slice(*UPDATABLE))
    node
  end

  def apply_move(op)
    node = @document.nodes.find(op["id"])
    NodeMover.new(node).call(parent_id: op["parent_id"], position: op["position"])
  rescue NodeMover::InvalidMove => e
    Rails.logger.warn(conflict_log(:invalid_move, node, op, e.message))
    raise Conflict, e.message
  end

  def apply_delete(op)
    @document.nodes.find(op["id"]).destroy!
    nil
  end

  def conflict_log(kind, node, op, reason = nil)
    {
      conflict: kind, document_id: @document.id, node_id: node&.id,
      incoming: op, existing_updated_at: node&.updated_at&.iso8601,
      reason: reason
    }.to_json
  end
end
```

- [ ] **Step 4: Run, expect pass**

Run: `bin/rails test test/services/op_applier_test.rb`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: OpApplier (create/update/move/delete, LWW + conflict logging)"
```

---

## Task 8: Documents, Folders, Bookmarks, CaptureTarget, CustomEmoji models

**Files:**
- Create: migrations + models for `bookmarks`, `capture_targets`, `custom_emoji`
- Test: `test/models/bookmark_test.rb`, `test/models/capture_target_test.rb`, `test/models/custom_emoji_test.rb`

- [ ] **Step 1: Failing tests**

```ruby
# test/models/bookmark_test.rb
require "test_helper"
class BookmarkTest < ActiveSupport::TestCase
  setup do
    @doc = Document.create!(name: "O", doc_prefix: "o", position: 0)
    @node = Node.create!(document: @doc, content: "x", position: 0)
  end
  test "belongs to a node and stores label/emoji/position" do
    b = Bookmark.create!(node_id: @node.id, label: "Inbox", emoji: "📥", position: 0)
    assert_equal @node.id, b.node_id
  end
end
```

```ruby
# test/models/capture_target_test.rb
require "test_helper"
class CaptureTargetTest < ActiveSupport::TestCase
  setup do
    @doc = Document.create!(name: "O", doc_prefix: "o", position: 0)
    @node = Node.create!(document: @doc, content: "x", position: 0)
  end
  test "exactly one default is allowed" do
    CaptureTarget.create!(name: "inbox", node_id: @node.id, is_default: true)
    second = CaptureTarget.new(name: "other", node_id: @node.id, is_default: true)
    assert_not second.valid?
  end
end
```

```ruby
# test/models/custom_emoji_test.rb
require "test_helper"
class CustomEmojiTest < ActiveSupport::TestCase
  test "stores a name and an image_path" do
    e = CustomEmoji.create!(name: "parrot", image_path: "emoji/parrot.gif")
    assert_equal "emoji/parrot.gif", e.image_path
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/models/bookmark_test.rb test/models/capture_target_test.rb test/models/custom_emoji_test.rb`
Expected: FAIL — constants undefined.

- [ ] **Step 3: Migrations**

```ruby
# db/migrate/<ts>_create_bookmarks.rb
class CreateBookmarks < ActiveRecord::Migration[8.1]
  def change
    create_table :bookmarks do |t|
      t.string :node_id, null: false
      t.string :label
      t.string :emoji
      t.integer :position, null: false, default: 0
      t.timestamps
    end
    add_index :bookmarks, :node_id
  end
end
```

```ruby
# db/migrate/<ts>_create_capture_targets.rb
class CreateCaptureTargets < ActiveRecord::Migration[8.1]
  def change
    create_table :capture_targets do |t|
      t.string :name, null: false
      t.string :node_id, null: false
      t.boolean :is_default, null: false, default: false
      t.timestamps
    end
    add_index :capture_targets, :name, unique: true
    add_index :capture_targets, :is_default, unique: true, where: "is_default = 1"
  end
end
```

```ruby
# db/migrate/<ts>_create_custom_emoji.rb
class CreateCustomEmoji < ActiveRecord::Migration[8.1]
  def change
    create_table :custom_emoji do |t|
      t.string :name, null: false
      t.string :image_path, null: false   # file under app data dir, served by nginx
      t.timestamps
    end
    add_index :custom_emoji, :name, unique: true
  end
end
```

- [ ] **Step 4: Models**

```ruby
# app/models/bookmark.rb
class Bookmark < ApplicationRecord
  belongs_to :node, primary_key: :id, foreign_key: :node_id
end
```

```ruby
# app/models/capture_target.rb
class CaptureTarget < ApplicationRecord
  belongs_to :node, primary_key: :id, foreign_key: :node_id
  validates :name, presence: true, uniqueness: true
  validate :only_one_default

  private

  def only_one_default
    return unless is_default?
    clash = CaptureTarget.where(is_default: true).where.not(id: id).exists?
    errors.add(:is_default, "another default already exists") if clash
  end
end
```

```ruby
# app/models/custom_emoji.rb
class CustomEmoji < ApplicationRecord
  self.table_name = "custom_emoji"
  validates :name, presence: true, uniqueness: true
  validates :image_path, presence: true
end
```

Run: `bin/rails db:migrate`

- [ ] **Step 5: Run, expect pass**

Run: `bin/rails test test/models/bookmark_test.rb test/models/capture_target_test.rb test/models/custom_emoji_test.rb`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Bookmark, CaptureTarget, CustomEmoji models"
```

---

## Task 9: NodeSearch service — FTS5 search, backlinks, unlinked references

**Files:**
- Create: `db/migrate/<ts>_create_nodes_fts.rb`, `app/services/node_search.rb`
- Modify: `app/models/node.rb` (FTS sync hooks)
- Test: `test/services/node_search_test.rb`

Reference: `search/mod.rs`.

- [ ] **Step 1: Failing test**

```ruby
# test/services/node_search_test.rb
require "test_helper"

class NodeSearchTest < ActiveSupport::TestCase
  setup do
    @doc = Document.create!(name: "O", doc_prefix: "o", position: 0)
    @apple = Node.create!(document: @doc, content: "apple pie recipe", position: 0)
    @banana = Node.create!(document: @doc, content: "banana bread", position: 1)
    @link = Node.create!(document: @doc, content: "see [[apple pie recipe]]", position: 2)
  end

  test "search matches FTS tokens" do
    ids = NodeSearch.new.search("apple").map(&:id)
    assert_includes ids, @apple.id
    assert_not_includes ids, @banana.id
  end

  test "search reflects edits (FTS stays in sync)" do
    @banana.update!(content: "apple turnover")
    ids = NodeSearch.new.search("apple").map(&:id)
    assert_includes ids, @banana.id
  end

  test "backlinks finds nodes that wiki-link to a target's content" do
    ids = NodeSearch.new.backlinks(@apple).map(&:id)
    assert_includes ids, @link.id
  end

  test "deleting a node removes it from the index" do
    @apple.destroy!
    assert_empty NodeSearch.new.search("apple").select { |n| n.id == @apple.id }
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/services/node_search_test.rb`
Expected: FAIL — `uninitialized constant NodeSearch` / missing FTS table.

- [ ] **Step 3: FTS migration**

```ruby
# db/migrate/<ts>_create_nodes_fts.rb
class CreateNodesFts < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE VIRTUAL TABLE nodes_fts USING fts5(
        node_id UNINDEXED, content, note
      );
    SQL
  end

  def down
    execute "DROP TABLE IF EXISTS nodes_fts;"
  end
end
```

- [ ] **Step 4: FTS sync hooks on Node**

```ruby
# add to app/models/node.rb
  after_save    :sync_fts
  after_destroy :remove_fts

  def sync_fts
    self.class.connection.exec_update(
      "DELETE FROM nodes_fts WHERE node_id = ?", "fts-del", [id]
    )
    self.class.connection.exec_insert(
      "INSERT INTO nodes_fts (node_id, content, note) VALUES (?, ?, ?)",
      "fts-ins", [id, content.to_s, note.to_s]
    )
  end

  def remove_fts
    self.class.connection.exec_update(
      "DELETE FROM nodes_fts WHERE node_id = ?", "fts-del", [id]
    )
  end
```

- [ ] **Step 5: NodeSearch service**

```ruby
# app/services/node_search.rb
class NodeSearch
  def search(query, document_id: nil, limit: 100)
    sql = <<~SQL
      SELECT node_id FROM nodes_fts WHERE nodes_fts MATCH ? LIMIT ?
    SQL
    rows = Node.connection.exec_query(sql, "fts-search", [fts_query(query), limit])
    ids = rows.rows.map(&:first)
    scope = Node.where(id: ids)
    scope = scope.where(document_id: document_id) if document_id
    # preserve match order
    scope.index_by(&:id).values_at(*ids).compact
  end

  # Nodes whose content references the target via [[wiki-link]] to its content.
  def backlinks(target, limit: 100)
    needle = "[[#{target.content}]]"
    Node.where("content LIKE ?", "%#{needle}%").where.not(id: target.id).limit(limit).to_a
  end

  # Nodes mentioning the target's content as plain text but NOT as a wiki-link.
  def unlinked_references(target, limit: 100)
    plain = target.content
    linked = "[[#{target.content}]]"
    Node.where("content LIKE ?", "%#{plain}%")
        .where("content NOT LIKE ?", "%#{linked}%")
        .where.not(id: target.id).limit(limit).to_a
  end

  private

  # Escape an FTS5 query into a quoted prefix match to avoid syntax errors.
  def fts_query(q)
    %Q("#{q.gsub('"', '""')}"*)
  end
end
```

- [ ] **Step 6: Run, expect pass**

Run: `bin/rails test test/services/node_search_test.rb`
Expected: PASS (all 4).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: NodeSearch (FTS5 search, backlinks, unlinked refs) + FTS sync"
```

---

## Task 10: Nodes controller — create / update / destroy / move

**Files:**
- Create: `app/controllers/api/nodes_controller.rb`
- Modify: `config/routes.rb`
- Test: `test/controllers/api/nodes_controller_test.rb`

- [ ] **Step 1: Failing test**

```ruby
# test/controllers/api/nodes_controller_test.rb
require "test_helper"

class Api::NodesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @token = AccessToken.generate!(label: "t")
    @doc = Document.create!(name: "O", doc_prefix: "o", position: 0)
    @headers = { "Authorization" => "Bearer #{@token.secret}" }
  end

  test "401 without a token" do
    post api_nodes_url, params: { document_id: @doc.id, content: "x", position: 0 }, as: :json
    assert_response :unauthorized
  end

  test "creates a node" do
    assert_difference -> { Node.count }, 1 do
      post api_nodes_url, headers: @headers,
        params: { document_id: @doc.id, content: "hello", position: 0 }, as: :json
    end
    assert_response :created
  end

  test "updates a node" do
    n = Node.create!(document: @doc, content: "old", position: 0)
    patch api_node_url(n), headers: @headers, params: { content: "new" }, as: :json
    assert_response :ok
    assert_equal "new", n.reload.content
  end

  test "deletes a node" do
    n = Node.create!(document: @doc, content: "x", position: 0)
    delete api_node_url(n), headers: @headers
    assert_response :no_content
    assert_not Node.exists?(n.id)
  end

  test "move reindexes siblings" do
    a = Node.create!(document: @doc, content: "a", position: 0)
    b = Node.create!(document: @doc, content: "b", position: 1)
    patch move_api_node_url(b), headers: @headers,
      params: { parent_id: nil, position: 0 }, as: :json
    assert_response :ok
    assert_equal %w[b a], Node.siblings_of(@doc.id, nil).pluck(:content)
  end

  test "move cycle returns 422" do
    a = Node.create!(document: @doc, content: "a", position: 0)
    b = Node.create!(document: @doc, parent_id: a.id, content: "b", position: 0)
    patch move_api_node_url(a), headers: @headers,
      params: { parent_id: b.id, position: 0 }, as: :json
    assert_response :unprocessable_entity
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/controllers/api/nodes_controller_test.rb`
Expected: FAIL — routes/controller undefined.

- [ ] **Step 3: Routes**

```ruby
# config/routes.rb
Rails.application.routes.draw do
  namespace :api do
    resources :nodes, only: [:create, :update, :destroy] do
      member { patch :move }
    end
    resources :documents, only: [:index, :show, :create, :destroy] do
      member { patch :rename_prefix }
    end
    resources :folders, only: [:index, :create, :update, :destroy] do
      collection { patch :reorder }
    end
    resources :bookmarks, only: [:index, :create, :update, :destroy] do
      collection { patch :reorder }
    end
    post   "ops",                 to: "ops#create"
    get    "search",              to: "search#search"
    get    "nodes/:id/backlinks", to: "search#backlinks", as: :node_backlinks
    get    "nodes/:id/unlinked",  to: "search#unlinked",  as: :node_unlinked
    get    "dated_nodes",         to: "search#dated",     as: :dated_nodes
  end
end
```

- [ ] **Step 4: Controller**

```ruby
# app/controllers/api/nodes_controller.rb
class Api::NodesController < Api::BaseController
  def create
    doc = Document.find(params.require(:document_id))
    node = doc.nodes.create!(node_params)
    render json: node, status: :created
  end

  def update
    node = Node.find(params[:id])
    node.update!(node_params)
    render json: node, status: :ok
  end

  def destroy
    Node.find(params[:id]).destroy!
    head :no_content
  end

  def move
    node = Node.find(params[:id])
    moved = NodeMover.new(node).call(parent_id: params[:parent_id], position: params.require(:position))
    render json: moved, status: :ok
  rescue NodeMover::InvalidMove => e
    render_error(:unprocessable_entity, e.message)
  end

  private

  def node_params
    params.permit(:parent_id, :position, :content, :note, :node_type, :heading_level,
                  :is_checked, :color, :date, :date_recurrence, :recurrence_mode,
                  :date_end, :defer_date, :short_id, :collapsed, :mirror_source_id,
                  tags: [])
  end
end
```

- [ ] **Step 5: Run, expect pass**

Run: `bin/rails test test/controllers/api/nodes_controller_test.rb`
Expected: PASS (all 6).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Api::NodesController (CRUD + move) + routes"
```

---

## Task 11: Ops controller — batch POST /ops (all-or-nothing)

**Files:**
- Create: `app/controllers/api/ops_controller.rb`
- Test: `test/controllers/api/ops_controller_test.rb`

- [ ] **Step 1: Failing test**

```ruby
# test/controllers/api/ops_controller_test.rb
require "test_helper"

class Api::OpsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @token = AccessToken.generate!(label: "t")
    @doc = Document.create!(name: "O", doc_prefix: "o", position: 0)
    @headers = { "Authorization" => "Bearer #{@token.secret}" }
  end

  test "applies a batch of ops in order" do
    id = SecureRandom.uuid
    post api_ops_url, headers: @headers, as: :json, params: {
      document_id: @doc.id,
      ops: [
        { type: "create", id: id, content: "a", position: 0 },
        { type: "update", id: id, content: "a2" }
      ]
    }
    assert_response :ok
    assert_equal "a2", Node.find(id).content
  end

  test "a single invalid op rolls back the whole batch" do
    good = SecureRandom.uuid
    post api_ops_url, headers: @headers, as: :json, params: {
      document_id: @doc.id,
      ops: [
        { type: "create", id: good, content: "a", position: 0 },
        { type: "frobnicate" }
      ]
    }
    assert_response :unprocessable_entity
    body = JSON.parse(response.body)
    assert_equal 1, body["failed_index"]
    assert_not Node.exists?(good), "batch must roll back on any failure"
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/controllers/api/ops_controller_test.rb`
Expected: FAIL — controller undefined.

- [ ] **Step 3: Controller**

```ruby
# app/controllers/api/ops_controller.rb
class Api::OpsController < Api::BaseController
  def create
    doc = Document.find(params.require(:document_id))
    ops = params.require(:ops).map { |op| op.to_unsafe_h.stringify_keys }
    applier = OpApplier.new(doc)
    Node.transaction do
      ops.each_with_index do |op, idx|
        begin
          applier.apply!(op)
        rescue OpApplier::UnknownOp, OpApplier::Conflict,
               ActiveRecord::RecordInvalid, ActiveRecord::RecordNotFound => e
          render_error(:unprocessable_entity, e.message, failed_index: idx)
          raise ActiveRecord::Rollback
        end
      end
    end
  ensure
    render json: { applied: true }, status: :ok unless performed?
  end
end
```

- [ ] **Step 4: Run, expect pass**

Run: `bin/rails test test/controllers/api/ops_controller_test.rb`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Api::OpsController batch (all-or-nothing + failed_index)"
```

---

## Task 12: Documents, Folders, Bookmarks controllers

**Files:**
- Create: `app/controllers/api/documents_controller.rb`, `folders_controller.rb`, `bookmarks_controller.rb`
- Test: `test/controllers/api/documents_controller_test.rb`, `folders_controller_test.rb`, `bookmarks_controller_test.rb`

- [ ] **Step 1: Failing tests**

```ruby
# test/controllers/api/documents_controller_test.rb
require "test_helper"
class Api::DocumentsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @token = AccessToken.generate!(label: "t")
    @headers = { "Authorization" => "Bearer #{@token.secret}" }
  end

  test "lists documents" do
    Document.create!(name: "A", doc_prefix: "a", position: 0)
    get api_documents_url, headers: @headers
    assert_response :ok
    assert_equal 1, JSON.parse(response.body).length
  end

  test "show returns the document with its nodes" do
    d = Document.create!(name: "A", doc_prefix: "a", position: 0)
    Node.create!(document: d, content: "x", position: 0)
    get api_document_url(d), headers: @headers
    assert_response :ok
    assert_equal 1, JSON.parse(response.body)["nodes"].length
  end

  test "rename_prefix changes the prefix" do
    d = Document.create!(name: "A", doc_prefix: "a", position: 0)
    patch rename_prefix_api_document_url(d), headers: @headers,
      params: { doc_prefix: "alpha" }, as: :json
    assert_response :ok
    assert_equal "alpha", d.reload.doc_prefix
  end
end
```

```ruby
# test/controllers/api/folders_controller_test.rb
require "test_helper"
class Api::FoldersControllerTest < ActionDispatch::IntegrationTest
  setup do
    @token = AccessToken.generate!(label: "t")
    @headers = { "Authorization" => "Bearer #{@token.secret}" }
  end
  test "reorder updates positions" do
    a = Folder.create!(name: "A", position: 0)
    b = Folder.create!(name: "B", position: 1)
    patch reorder_api_folders_url, headers: @headers,
      params: { order: [b.id, a.id] }, as: :json
    assert_response :ok
    assert_equal 0, b.reload.position
    assert_equal 1, a.reload.position
  end
end
```

```ruby
# test/controllers/api/bookmarks_controller_test.rb
require "test_helper"
class Api::BookmarksControllerTest < ActionDispatch::IntegrationTest
  setup do
    @token = AccessToken.generate!(label: "t")
    @doc = Document.create!(name: "O", doc_prefix: "o", position: 0)
    @node = Node.create!(document: @doc, content: "x", position: 0)
    @headers = { "Authorization" => "Bearer #{@token.secret}" }
  end
  test "creates a bookmark" do
    assert_difference -> { Bookmark.count }, 1 do
      post api_bookmarks_url, headers: @headers,
        params: { node_id: @node.id, label: "Inbox", position: 0 }, as: :json
    end
    assert_response :created
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/controllers/api/documents_controller_test.rb test/controllers/api/folders_controller_test.rb test/controllers/api/bookmarks_controller_test.rb`
Expected: FAIL — controllers undefined.

- [ ] **Step 3: Controllers**

```ruby
# app/controllers/api/documents_controller.rb
class Api::DocumentsController < Api::BaseController
  def index
    render json: Document.order(:position)
  end

  def show
    doc = Document.find(params[:id])
    render json: doc.as_json.merge("nodes" => doc.nodes.order(:parent_id, :position).as_json)
  end

  def create
    render json: Document.create!(document_params), status: :created
  end

  def destroy
    Document.find(params[:id]).destroy!
    head :no_content
  end

  def rename_prefix
    doc = Document.find(params[:id])
    doc.update!(doc_prefix: params.require(:doc_prefix))
    render json: doc, status: :ok
  end

  private

  def document_params
    params.permit(:name, :doc_prefix, :folder_id, :position)
  end
end
```

```ruby
# app/controllers/api/folders_controller.rb
class Api::FoldersController < Api::BaseController
  def index;   render json: Folder.order(:position); end
  def create;  render json: Folder.create!(folder_params), status: :created; end
  def update;  f = Folder.find(params[:id]); f.update!(folder_params); render json: f; end
  def destroy; Folder.find(params[:id]).destroy!; head :no_content; end

  def reorder
    Folder.transaction do
      params.require(:order).each_with_index do |id, idx|
        Folder.where(id: id).update_all(position: idx)
      end
    end
    head :ok
  end

  private

  def folder_params
    params.permit(:name, :position)
  end
end
```

```ruby
# app/controllers/api/bookmarks_controller.rb
class Api::BookmarksController < Api::BaseController
  def index;   render json: Bookmark.order(:position); end
  def create;  render json: Bookmark.create!(bookmark_params), status: :created; end
  def update;  b = Bookmark.find(params[:id]); b.update!(bookmark_params); render json: b; end
  def destroy; Bookmark.find(params[:id]).destroy!; head :no_content; end

  def reorder
    Bookmark.transaction do
      params.require(:order).each_with_index do |id, idx|
        Bookmark.where(id: id).update_all(position: idx)
      end
    end
    head :ok
  end

  private

  def bookmark_params
    params.permit(:node_id, :label, :emoji, :position)
  end
end
```

- [ ] **Step 4: Run, expect pass**

Run: `bin/rails test test/controllers/api/documents_controller_test.rb test/controllers/api/folders_controller_test.rb test/controllers/api/bookmarks_controller_test.rb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Documents/Folders/Bookmarks controllers (+ reorder, rename_prefix)"
```

---

## Task 13: Search controller — search / backlinks / unlinked / dated

**Files:**
- Create: `app/controllers/api/search_controller.rb`
- Test: `test/controllers/api/search_controller_test.rb`

- [ ] **Step 1: Failing test**

```ruby
# test/controllers/api/search_controller_test.rb
require "test_helper"

class Api::SearchControllerTest < ActionDispatch::IntegrationTest
  setup do
    @token = AccessToken.generate!(label: "t")
    @doc = Document.create!(name: "O", doc_prefix: "o", position: 0)
    @apple = Node.create!(document: @doc, content: "apple pie", position: 0)
    @link = Node.create!(document: @doc, content: "see [[apple pie]]", position: 1)
    @dated = Node.create!(document: @doc, content: "meeting", position: 2, date: "2026-06-10")
    @headers = { "Authorization" => "Bearer #{@token.secret}" }
  end

  test "search returns matching nodes" do
    get api_search_url, headers: @headers, params: { q: "apple" }
    assert_response :ok
    ids = JSON.parse(response.body).map { |n| n["id"] }
    assert_includes ids, @apple.id
  end

  test "backlinks returns linking nodes" do
    get node_backlinks_url(@apple), headers: @headers
    assert_response :ok
    ids = JSON.parse(response.body).map { |n| n["id"] }
    assert_includes ids, @link.id
  end

  test "dated returns nodes with a date" do
    get dated_nodes_url, headers: @headers
    assert_response :ok
    ids = JSON.parse(response.body).map { |n| n["id"] }
    assert_includes ids, @dated.id
    assert_not_includes ids, @apple.id
  end
end
```

- [ ] **Step 2: Run, expect fail**

Run: `bin/rails test test/controllers/api/search_controller_test.rb`
Expected: FAIL — controller undefined.

- [ ] **Step 3: Controller**

```ruby
# app/controllers/api/search_controller.rb
class Api::SearchController < Api::BaseController
  def search
    results = NodeSearch.new.search(params.require(:q), document_id: params[:document_id])
    render json: results
  end

  def backlinks
    target = Node.find(params[:id])
    render json: NodeSearch.new.backlinks(target)
  end

  def unlinked
    target = Node.find(params[:id])
    render json: NodeSearch.new.unlinked_references(target)
  end

  def dated
    render json: Node.where.not(date: nil).order(:date)
  end
end
```

- [ ] **Step 4: Run, expect pass**

Run: `bin/rails test test/controllers/api/search_controller_test.rb`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Api::SearchController (search/backlinks/unlinked/dated)"
```

---

## Task 14: Full suite green + token bootstrap rake task + deploy notes

**Files:**
- Create: `lib/tasks/token.rake`
- Create: `config/deploy.md` (notes), `config/passenger.conf.example`
- Test: full suite

- [ ] **Step 1: Token bootstrap rake task**

```ruby
# lib/tasks/token.rake
namespace :outline do
  desc "Mint a personal access token: rake outline:token LABEL=cli"
  task token: :environment do
    label = ENV.fetch("LABEL", "cli")
    t = AccessToken.generate!(label: label)
    puts "label=#{t.label} token=#{t.secret}"
  end
end
```

- [ ] **Step 2: Deploy notes (nginx + Passenger)**

```
# config/deploy.md
- Ruby 3.3+, Rails 8.1.x, SQLite with FTS5 compiled in (default in modern sqlite3 gem).
- Served by nginx + Passenger; deploy via git pull + bin/rails db:migrate + restart.
- Rails own-assets via Propshaft; the React UI bundle (later phase) is built by Vite
  and served as static files by nginx — NOT through importmaps.
- custom_emoji images live under the app data dir and are served directly by nginx.
- Mint the CLI token on the host with: RAILS_ENV=production bin/rails outline:token LABEL=cli
```

```
# config/passenger.conf.example
server {
  listen 80;
  server_name outline.example.com;
  root /var/www/outline-web/public;
  passenger_enabled on;
  passenger_ruby /usr/bin/ruby;
  # static emoji/assets served directly:
  location /emoji/ { alias /var/www/outline-data/emoji/; }
}
```

- [ ] **Step 3: Run the whole suite**

Run: `bin/rails test`
Expected: PASS — all model, service, and controller tests green; 0 failures, 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: token bootstrap task + deploy notes; full suite green"
```

---

## Self-Review (completed during authoring)

**Spec coverage check (each spec item → task):**
- Single-user auth (session + token) → Task 2 (token + Bearer). *Gap: password session for the browser UI is deferred — there is no UI in Phase 0+1; session login lands with the Phase 2 web client. Noted explicitly so it isn't lost.*
- Dropped Tauri-only commands → not ported (no tasks needed); confirmed absent.
- Data model tables (documents, folders, nodes, bookmarks, capture_targets, custom_emoji, nodes_fts) → Tasks 3, 4, 5, 8, 9.
- Dates as strings, tags as JSON, UUID PKs, LWW → Tasks 5 (schema) + 7 (LWW).
- Move as distinct op, integer reindex, invariants → Task 6 (NodeMover) + Task 10 (endpoint).
- Batch /ops all-or-nothing + conflict logging → Task 11 + Task 7 (logging in OpApplier).
- API surface (nodes, ops, documents, folders, bookmarks, search/backlinks/unlinked/dated) → Tasks 10–13.
- FTS5 search + backlinks + unlinked references → Task 9 + Task 13.
- custom_emoji file path served by nginx → Task 8 (schema) + Task 14 (nginx config).
- Rails 8.1.x, nginx+Passenger, Vite/Propshaft → Task 1 + Task 14.
- Tests ported from Rust oracle → embedded throughout (Tasks 5–9 mirror outline-core test cases).

**Placeholder scan:** none — every code step shows full code.

**Type consistency:** `NodeMover#call(parent_id:, position:)`, `OpApplier#apply!(op)`, `NodeSearch#search/backlinks/unlinked_references`, `AccessToken.generate!/authenticate`, route helper names (`move_api_node_url`, `rename_prefix_api_document_url`, `reorder_api_folders_url`, `node_backlinks_url`, `dated_nodes_url`) are consistent between their defining task and their callers.

**Open follow-ups (not blockers for this plan):**
- Password session login for the browser UI → folds into Phase 2.
- Capture-target HTTP endpoints → Phase 5 (model exists now; the capture form/endpoint is a Phase-5 feature).
