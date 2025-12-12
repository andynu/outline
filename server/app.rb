# frozen_string_literal: true

require 'sinatra/base'
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

    def inbox_path
      File.join(data_dir, 'inbox.jsonl')
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
  end

  # Health check - no auth required
  get '/health' do
    content_type :json
    {
      status: 'ok',
      data_dir_exists: File.directory?(data_dir),
      inbox_writable: File.writable?(File.dirname(inbox_path)),
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

  # Mobile capture form
  get '/outline/capture' do
    erb :capture
  end

  # Handle capture submission
  post '/outline/capture' do
    content = params[:content]&.strip

    if content.nil? || content.empty?
      @error = 'Content is required'
      return erb(:capture)
    end

    entry = {
      id: SecureRandom.uuid,
      content: content,
      note: params[:note]&.strip,
      captured_at: Time.now.iso8601,
      source: 'web'
    }.compact

    # Append to inbox.jsonl
    File.open(inbox_path, 'a') do |f|
      f.puts(entry.to_json)
    end

    @success = true
    erb :capture
  end

  # API endpoint for programmatic capture (shortcuts, automation)
  post '/outline/api/inbox' do
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

    entry = {
      id: SecureRandom.uuid,
      content: content,
      note: data[:note]&.strip,
      captured_at: Time.now.iso8601,
      source: data[:source] || 'api'
    }.compact

    # Append to inbox.jsonl
    File.open(inbox_path, 'a') do |f|
      f.puts(entry.to_json)
    end

    json_response({ success: true, id: entry[:id] }, status: 201)
  end

  # Get inbox items (for desktop to poll, or viewer to display)
  get '/outline/api/inbox' do
    unless File.exist?(inbox_path)
      json_response([])
    end

    items = File.readlines(inbox_path).filter_map do |line|
      line = line.strip
      next if line.empty?
      JSON.parse(line, symbolize_names: true)
    rescue JSON::ParserError
      nil
    end

    content_type :json
    items.to_json
  end
end
