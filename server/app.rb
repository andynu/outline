# frozen_string_literal: true

require 'sinatra/base'
require 'fileutils'
require 'json'
require 'securerandom'
require 'time'

class OutlineServer < Sinatra::Base
  configure do
    set :public_folder, File.join(settings.root, 'public')
    set :views, File.join(settings.root, 'views')

    # Load config or use defaults
    config_path = ENV.fetch('OUTLINE_CONFIG', File.join(settings.root, 'config.json'))
    if File.exist?(config_path)
      set :outline_config, JSON.parse(File.read(config_path), symbolize_names: true)
    else
      set :outline_config, {
        data_dir: ENV.fetch('OUTLINE_DATA_DIR', File.expand_path('~/.outline')),
        calendar_tokens: ENV.fetch('OUTLINE_CALENDAR_TOKENS', '').split(',').map(&:strip).reject(&:empty?)
      }
    end
  end

  helpers do
    def data_dir
      settings.outline_config[:data_dir]
    end

    def calendar_tokens
      settings.outline_config[:calendar_tokens]
    end

    def valid_calendar_token?(token)
      calendar_tokens.include?(token)
    end

    def documents_dir
      File.join(data_dir, 'documents')
    end

    def feed_path
      File.join(data_dir, 'feed.ics')
    end

    def json_response(data, status: 200)
      content_type :json
      halt status, data.to_json
    end

    def today_date
      Time.now.strftime('%Y-%m-%d')
    end

    def capture_target
      settings.outline_config[:capture_target]
    end

    # Build a pending operation to create a node as a child of the capture target
    def build_capture_op(content:, note: nil)
      node_id = SecureRandom.uuid
      now = Time.now.utc.strftime('%Y-%m-%dT%H:%M:%S.%6NZ')
      # Position is set high to append at the end; the app will normalize on load
      ops = [{
        op: 'create',
        id: node_id,
        parent_id: capture_target[:node_id],
        position: 999999,
        content: content,
        node_type: 'bullet',
        updated_at: now
      }]

      if note && !note.empty?
        ops << {
          op: 'update',
          id: node_id,
          changes: { note: note },
          updated_at: now
        }
      end

      ops
    end

    # Append operations to pending.server.jsonl in the capture target's document directory
    def append_to_pending(ops)
      target = capture_target
      doc_dir = File.join(documents_dir, target[:document_id])
      FileUtils.mkdir_p(doc_dir)
      pending_path = File.join(doc_dir, 'pending.server.jsonl')

      File.open(pending_path, 'a') do |f|
        ops.each { |op| f.puts(op.to_json) }
      end
    end
  end

  # Health check - no auth required
  get '/health' do
    content_type :json
    {
      status: 'ok',
      data_dir_exists: File.directory?(data_dir),
      capture_configured: !capture_target.nil?,
      timestamp: Time.now.iso8601
    }.to_json
  end

  # Calendar feed - token-based auth (no basic auth)
  # URL: /calendar/{token}/feed.ics
  get '/calendar/:token/feed.ics' do
    token = params[:token]

    unless valid_calendar_token?(token)
      halt 404, 'Not Found'
    end

    unless File.exist?(feed_path)
      halt 404, 'Calendar feed not yet generated'
    end

    content_type 'text/calendar; charset=utf-8'
    cache_control :private, :no_cache
    headers['Content-Disposition'] = 'inline; filename="feed.ics"'

    File.read(feed_path)
  end

  # Static state.json for read-only viewer (protected by nginx basic auth)
  get '/outline/data/:doc_id/state.json' do
    doc_id = params[:doc_id]

    # Validate doc_id format (UUID)
    unless doc_id.match?(/\A[a-f0-9-]{36}\z/i)
      halt 400, 'Invalid document ID'
    end

    state_path = File.join(documents_dir, doc_id, 'state.json')

    unless File.exist?(state_path)
      halt 404, 'Document not found'
    end

    content_type :json
    cache_control :private, :no_cache

    File.read(state_path)
  end

  # List documents (for read-only viewer)
  get '/outline/data/documents.json' do
    meta_path = File.join(data_dir, 'meta.jsonl')

    unless File.exist?(meta_path)
      json_response([])
    end

    documents = File.readlines(meta_path).filter_map do |line|
      line = line.strip
      next if line.empty?
      JSON.parse(line, symbolize_names: true)
    rescue JSON::ParserError
      nil
    end

    content_type :json
    cache_control :private, :no_cache
    documents.to_json
  end

  # Read-only viewer SPA
  get '/outline/view' do
    send_file File.join(settings.public_folder, 'viewer.html')
  end

  # Mobile capture form
  get '/outline/capture' do
    unless capture_target
      halt 503, 'Capture target not configured. Add capture_target to server config.'
    end
    erb :capture
  end

  # Handle capture submission
  post '/outline/capture' do
    unless capture_target
      halt 503, 'Capture target not configured'
    end

    content = params[:content]&.strip

    if content.nil? || content.empty?
      @error = 'Content is required'
      return erb(:capture)
    end

    ops = build_capture_op(
      content: content,
      note: params[:note]&.strip
    )
    append_to_pending(ops)

    @success = true
    erb :capture
  end

  # API endpoint for programmatic capture (shortcuts, automation)
  post '/outline/api/capture' do
    unless capture_target
      json_response({ error: 'Capture target not configured' }, status: 503)
    end

    request.body.rewind
    body = request.body.read

    begin
      data = JSON.parse(body, symbolize_names: true)
    rescue JSON::ParserError
      json_response({ error: 'Invalid JSON' }, status: 400)
    end

    content = data[:content]&.strip

    if content.nil? || content.empty?
      json_response({ error: 'Content is required' }, status: 400)
    end

    ops = build_capture_op(
      content: content,
      note: data[:note]&.strip
    )
    append_to_pending(ops)

    json_response({ success: true, node_id: ops.first[:id] }, status: 201)
  end
end
