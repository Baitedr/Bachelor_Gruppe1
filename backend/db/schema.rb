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

ActiveRecord::Schema[7.1].define(version: 2026_02_23_002000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "plpgsql"
  enable_extension "uuid-ossp"

  create_table "poll_options", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.uuid "poll_id"
    t.text "text", null: false
  end

  create_table "poll_responses", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.uuid "poll_id"
    t.uuid "user_id"
    t.text "answer", null: false
    t.datetime "submitted_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.index ["poll_id"], name: "idx_poll_responses_poll_id"
  end

  create_table "polls", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.uuid "slide_id"
    t.text "question", null: false
    t.text "poll_type", null: false
    t.boolean "is_active", default: false
    t.index ["slide_id"], name: "idx_polls_slide_id"
  end

  create_table "presentation_sessions", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.uuid "presentation_id"
    t.datetime "started_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.datetime "ended_at", precision: nil
  end

  create_table "presentations", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.text "title", null: false
    t.uuid "owner_id"
    t.boolean "is_live", default: false
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
  end

  create_table "refresh_tokens", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.uuid "user_id"
    t.text "token", null: false
    t.datetime "expires_at", precision: nil, null: false
    t.boolean "revoked", default: false
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }

    t.unique_constraint ["token"], name: "refresh_tokens_token_key"
  end

  create_table "roles", id: :serial, force: :cascade do |t|
    t.text "name", null: false

    t.unique_constraint ["name"], name: "roles_name_key"
  end

  create_table "session_participants", primary_key: ["session_id", "user_id"], force: :cascade do |t|
    t.uuid "session_id", null: false
    t.uuid "user_id", null: false
    t.datetime "joined_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
  end

  create_table "slide_elements", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.uuid "slide_id"
    t.text "type", null: false
    t.jsonb "position", null: false
    t.jsonb "style"
    t.jsonb "content"
    t.integer "z_index", default: 0
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.index ["slide_id"], name: "idx_elements_slide_id"
  end

  create_table "slides", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.uuid "presentation_id"
    t.integer "slide_index", null: false
    t.jsonb "background"
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }
    t.index ["presentation_id"], name: "idx_slides_presentation_id"
  end

  create_table "users", id: :uuid, default: -> { "uuid_generate_v4()" }, force: :cascade do |t|
    t.text "email", null: false
    t.text "password_hash", null: false
    t.text "name"
    t.datetime "created_at", precision: nil, default: -> { "CURRENT_TIMESTAMP" }

    t.unique_constraint ["email"], name: "users_email_key"
  end

  add_foreign_key "poll_options", "polls", name: "poll_options_poll_id_fkey", on_delete: :cascade
  add_foreign_key "poll_responses", "polls", name: "poll_responses_poll_id_fkey", on_delete: :cascade
  add_foreign_key "poll_responses", "users", name: "poll_responses_user_id_fkey", on_delete: :nullify
  add_foreign_key "polls", "slides", name: "polls_slide_id_fkey", on_delete: :cascade
  add_foreign_key "presentation_sessions", "presentations", name: "presentation_sessions_presentation_id_fkey", on_delete: :cascade
  add_foreign_key "presentations", "users", column: "owner_id", name: "presentations_owner_id_fkey", on_delete: :cascade
  add_foreign_key "refresh_tokens", "users", name: "refresh_tokens_user_id_fkey", on_delete: :cascade
  add_foreign_key "session_participants", "presentation_sessions", column: "session_id", name: "session_participants_session_id_fkey", on_delete: :cascade
  add_foreign_key "session_participants", "users", name: "session_participants_user_id_fkey", on_delete: :cascade
  add_foreign_key "slide_elements", "slides", name: "slide_elements_slide_id_fkey", on_delete: :cascade
  add_foreign_key "slides", "presentations", name: "slides_presentation_id_fkey", on_delete: :cascade
end
