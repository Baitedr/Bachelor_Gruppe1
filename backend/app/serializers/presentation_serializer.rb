class PresentationSerializer
  def self.summary(presentation)
    new(presentation).summary
  end

  def self.one(presentation)
    new(presentation).one
  end

  def initialize(presentation)
    @presentation = presentation
  end

  def summary
    first_slide = @presentation.slides.first

    {
      id: @presentation.id,
      title: @presentation.title,
      user_email: @presentation.user_email,
      created_at: @presentation.created_at,
      updated_at: @presentation.updated_at,
      is_live: @presentation.is_live,
      slide_count: @presentation.slides.size,
      first_slide: first_slide_preview(first_slide)
    }
  end

  def one
    ordered_slides = @presentation.slides.order(:slide_index).includes(polls: :poll_options).to_a
    sessions = @presentation.presentation_sessions.order(started_at: :desc).to_a
    latest_session = sessions.first
    counts_by_poll_and_session = build_response_counts(ordered_slides, sessions)

    {
      id: @presentation.id,
      title: @presentation.title,
      user_email: @presentation.user_email,
      created_at: @presentation.created_at,
      updated_at: @presentation.updated_at,
      is_live: @presentation.is_live,
      variables: presentation_variables_for(@presentation),
      slides: ordered_slides.map do |slide|
        slide_payload(
          slide,
          latest_session: latest_session,
          sessions: sessions,
          counts_by_poll_and_session: counts_by_poll_and_session
        )
      end
    }
  end

  private

  def first_slide_preview(slide)
    return nil unless slide

    payload = slide.background.is_a?(Hash) ? slide.background : {}
    {
      title: payload_value(payload, 'title') || 'Slide 1',
      content: payload_value(payload, 'content') || '',
      backgroundColor: payload_value(payload, 'backgroundColor') || '#ffffff',
      previewImage: payload_value(payload, 'previewImage')
    }
  end

  def payload_value(payload, key)
    payload[key] || payload[key.to_sym]
  end

  def presentation_variables_for(presentation)
    first_slide = presentation.slides.order(:slide_index).first
    return [] unless first_slide

    payload = first_slide.background.is_a?(Hash) ? first_slide.background : {}
    SlidePayloadNormalizer.normalize_presentation_variables(payload['variables'] || payload[:variables])
  end

  def slide_payload(slide, latest_session:, sessions:, counts_by_poll_and_session:)
    payload = slide.background.is_a?(Hash) ? slide.background : {}
    polls = slide.polls

    {
      id: slide.id,
      slideIndex: slide.slide_index,
      title: payload['title'] || "Slide #{slide.slide_index + 1}",
      content: payload['content'] || '',
      notes: slide.notes.presence || payload_value(payload, 'notes') || '',
      backgroundColor: payload['backgroundColor'] || '#ffffff',
      fabricData: payload['fabricData'],
      previewImage: payload_value(payload, 'previewImage'),
      variables: SlidePayloadNormalizer.normalize_presentation_variables(payload['variables'] || payload[:variables]),
      questions: SlidePayloadNormalizer.normalize_slide_questions(payload['questions']),
      polls: polls.map do |poll|
        poll_payload_for_editor(
          poll,
          latest_session,
          sessions,
          counts_by_poll_and_session: counts_by_poll_and_session
        )
      end
    }
  end

  def poll_payload_for_editor(poll, latest_session, sessions, counts_by_poll_and_session:)
    latest_counts = counts_for_session(
      poll,
      latest_session,
      counts_by_poll_and_session: counts_by_poll_and_session
    )

    {
      id: poll.id,
      question: poll.question,
      options: poll.poll_options.map do |option|
        {
          id: option.id,
          text: option.text,
          votes: latest_counts[option.text].to_i
        }
      end,
      latestSessionId: latest_session&.id,
      sessionHistory: sessions.filter_map do |session|
        payload = session_history_payload(
          poll,
          session,
          counts_by_poll_and_session: counts_by_poll_and_session
        )
        payload if payload[:total] > 0
      end
    }
  end

  def counts_for_session(poll, session, counts_by_poll_and_session:)
    return {} unless session

    counts_by_poll_and_session.dig(poll.id, session.id) || {}
  end

  def session_history_payload(poll, session, counts_by_poll_and_session:)
    counts = counts_for_session(
      poll,
      session,
      counts_by_poll_and_session: counts_by_poll_and_session
    )
    total = counts.values.sum

    {
      id: session.id,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      total: total,
      options: poll.poll_options.map do |option|
        {
          id: option.id,
          text: option.text,
          votes: counts[option.text].to_i
        }
      end
    }
  end

  def build_response_counts(slides, sessions)
    poll_ids = slides.flat_map { |slide| slide.polls.map(&:id) }.compact
    session_ids = sessions.map(&:id).compact
    return {} if poll_ids.empty? || session_ids.empty?

    grouped = PollResponse.where(poll_id: poll_ids, presentation_session_id: session_ids)
                          .group(:poll_id, :presentation_session_id, :answer)
                          .count

    grouped.each_with_object({}) do |((poll_id, session_id, answer), votes), nested|
      nested[poll_id] ||= {}
      nested[poll_id][session_id] ||= {}
      nested[poll_id][session_id][answer] = votes
    end
  end
end
