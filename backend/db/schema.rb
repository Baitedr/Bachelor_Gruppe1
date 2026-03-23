# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_03_23_000100) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pg_session_jwt"
  enable_extension "uuid-ossp"

  create_table "poll_options", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "poll_id", null: false
    t.string "text", null: false
    t.datetime "updated_at", null: false
    t.index ["poll_id"], name: "index_poll_options_on_poll_id"
  end

  create_table "poll_responses", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "answer", null: false
    t.datetime "created_at", null: false
    t.uuid "poll_id", null: false
    t.uuid "presentation_session_id"
    t.datetime "updated_at", null: false
    t.uuid "user_id"
    t.index ["poll_id", "user_id", "presentation_session_id"], name: "index_poll_responses_on_poll_user_session", unique: true
    t.index ["poll_id"], name: "index_poll_responses_on_poll_id"
    t.index ["presentation_session_id"], name: "index_poll_responses_on_presentation_session_id"
    t.index ["user_id"], name: "index_poll_responses_on_user_id"
  end

  create_table "polls", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.boolean "is_active", default: true
    t.uuid "owner_id"
    t.string "poll_type", default: "multiple_choice", null: false
    t.string "question", null: false
    t.uuid "slide_id"
    t.datetime "updated_at", null: false
    t.index ["owner_id"], name: "index_polls_on_owner_id"
  end

  create_table "presentation_sessions", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.datetime "ended_at", precision: nil
    t.string "join_code"
    t.uuid "presentation_id"
    t.datetime "started_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.index ["join_code"], name: "index_presentation_sessions_on_join_code", unique: true
  end

  create_table "presentations", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.boolean "is_live", default: false
    t.uuid "owner_id"
    t.text "title", null: false
    t.text "user_email", null: false
    t.index ["user_email"], name: "index_presentations_on_user_email"
  end

  create_table "refresh_tokens", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.datetime "expires_at", precision: nil, null: false
    t.boolean "revoked", default: false
    t.text "token", null: false
    t.uuid "user_id"

    t.unique_constraint ["token"], name: "refresh_tokens_token_key"
  end

  create_table "roles", id: :serial, force: :cascade do |t|
    t.text "name", null: false

    t.unique_constraint ["name"], name: "roles_name_key"
  end

  create_table "session_participants", primary_key: ["session_id", "user_id"], force: :cascade do |t|
    t.datetime "joined_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.uuid "session_id", null: false
    t.uuid "user_id", null: false
  end

  create_table "slide_elements", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.jsonb "content"
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.jsonb "position", null: false
    t.uuid "slide_id"
    t.jsonb "style"
    t.text "type", null: false
    t.integer "z_index", default: 0
    t.index ["slide_id"], name: "idx_elements_slide_id"
  end

  create_table "slides", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.jsonb "background"
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.uuid "presentation_id"
    t.integer "slide_index", null: false
    t.index ["presentation_id"], name: "idx_slides_presentation_id"
  end

  create_table "users", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.text "email", null: false
    t.text "name"
    t.text "oauth_avatar_url"
    t.text "oauth_provider"
    t.text "oauth_uid"
    t.text "password_hash"
    t.datetime "reset_password_sent_at"
    t.text "reset_password_token_digest"
    t.index ["oauth_provider", "oauth_uid"], name: "index_users_on_oauth_provider_and_oauth_uid", unique: true, where: "((oauth_provider IS NOT NULL) AND (oauth_uid IS NOT NULL))"
    t.index ["reset_password_sent_at"], name: "index_users_on_reset_password_sent_at"
    t.unique_constraint ["email"], name: "users_email_key"
  end

  add_foreign_key "poll_options", "polls"
  add_foreign_key "poll_responses", "polls"
  add_foreign_key "poll_responses", "presentation_sessions"
  add_foreign_key "poll_responses", "users", on_delete: :nullify
  add_foreign_key "polls", "users", column: "owner_id", on_delete: :cascade
  add_foreign_key "presentation_sessions", "presentations", name: "presentation_sessions_presentation_id_fkey", on_delete: :cascade
  add_foreign_key "presentations", "users", column: "owner_id", name: "presentations_owner_id_fkey", on_delete: :cascade
  add_foreign_key "refresh_tokens", "users", name: "refresh_tokens_user_id_fkey", on_delete: :cascade
  add_foreign_key "session_participants", "presentation_sessions", column: "session_id", name: "session_participants_session_id_fkey", on_delete: :cascade
  add_foreign_key "session_participants", "users", name: "session_participants_user_id_fkey", on_delete: :cascade
  add_foreign_key "slide_elements", "slides", name: "slide_elements_slide_id_fkey", on_delete: :cascade
  add_foreign_key "slides", "presentations", name: "slides_presentation_id_fkey", on_delete: :cascade
end
