class AddPerformanceIndexes < ActiveRecord::Migration[7.0]
  disable_ddl_transaction!

  def change
    # Speeds up slide.polls lookups and JOIN paths such as
    # Poll.joins(:slide).where(slides: { presentation_id: ... }).
    unless index_exists?(:polls, :slide_id, name: 'index_polls_on_slide_id')
      add_index :polls, :slide_id, name: 'index_polls_on_slide_id', algorithm: :concurrently, if_not_exists: true
    end

    # The active-session lookup runs on almost every live interaction
    # (PresentationSession.where(presentation_id:, ended_at: nil)). A partial
    # index keeps it tiny and avoids full scans as the table grows.
    unless index_exists?(
      :presentation_sessions,
      :presentation_id,
      name: 'index_presentation_sessions_on_presentation_active'
    )
      add_index(
        :presentation_sessions,
        :presentation_id,
        name: 'index_presentation_sessions_on_presentation_active',
        where: 'ended_at IS NULL',
        algorithm: :concurrently,
        if_not_exists: true
      )
    end

    # Helps queries that order/lookup sessions by presentation without the
    # partial filter (e.g. presentation_payload history).
    unless index_exists?(
      :presentation_sessions,
      [:presentation_id, :started_at],
      name: 'index_presentation_sessions_on_presentation_started_at'
    )
      add_index(
        :presentation_sessions,
        [:presentation_id, :started_at],
        name: 'index_presentation_sessions_on_presentation_started_at',
        algorithm: :concurrently,
        if_not_exists: true
      )
    end
  end
end
