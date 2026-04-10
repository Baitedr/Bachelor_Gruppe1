class PresentationChannel < ApplicationCable::Channel
  def subscribed
    presentation = Presentation.find_by(id: params[:presentation_id])
    return reject unless presentation

    stream_for presentation

    active_session = active_session_for_presentation(presentation)
    return unless active_session && presentation.is_live

    participant_count = active_session.session_participants.count

    if current_user.id != presentation.owner_id
      SessionParticipant.find_or_create_by(
        session_id: active_session.id,
        user_id: current_user.id
      )
      participant_count = active_session.session_participants.count

      PresentationChannel.broadcast_to(
        presentation,
        { type: 'participant_joined', count: participant_count }
      )
    end

    transmit(
      {
        type: 'session_state',
        participant_count: participant_count,
        session_started: active_session.started?,
        session_ended: active_session.ended_at.present?
      }
    )
  end

  def unsubscribed
  end

  def start_session(_data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    active_session = active_session_for_presentation(presentation)
    return unless active_session

    active_session.update!(started: true)

    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'session_started',
        session_started: true,
        participant_count: active_session.session_participants.count
      }
    )
    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'session_state',
        participant_count: active_session.session_participants.count,
        session_started: true,
        session_ended: false
      }
    )
  end

  def navigate_slide(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    raw = data['slide_index']
    raw = data[:slide_index] if raw.nil?
    slide_index = Integer(raw)
    return if slide_index.negative?

    # Slik at gjenåpning av lysbilde ikke beholder gammel aktiv poll i DB.
    Poll.joins(:slide).where(slides: { presentation_id: presentation.id }).update_all(is_active: false)

    resume_raw = data['resume_liveboard']
    resume_raw = data[:resume_liveboard] if resume_raw.nil?
    resume_liveboard = resume_raw == true || resume_raw.to_s == 'true'

    payload = { type: 'slide_change', slide_index: slide_index }
    payload[:resume_liveboard] = true if resume_liveboard

    PresentationChannel.broadcast_to(presentation, payload)
  end

  # Før neste lysbilde: nullstiller aktive interaksjoner for alle klienter (publikum ser sliden tydelig).
  def clear_live_interactions(_data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    Poll.joins(:slide).where(slides: { presentation_id: presentation.id }).update_all(is_active: false)

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'interactions_cleared' }
    )
  end

  # Menti-lignende steg 2: alle ser liveboard-resultater for gjeldende lysbilde (slide_index fra klient).
  def show_liveboard(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    raw = data['slide_index']
    raw = data[:slide_index] if raw.nil?
    return if raw.nil?

    slide_index = Integer(raw)
    return if slide_index.negative?

    Poll.joins(:slide).where(slides: { presentation_id: presentation.id }).update_all(is_active: false)

    # Én melding: unngår at klienter prosesserer to WS-events i feil rekkefølge.
    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'liveboard_started',
        slide_index: slide_index,
        clear_interactions: true
      }
    )
  end

  # Presentatør går tilbake fra resultatvisning uten å bytte lysbilde.
  def dismiss_liveboard(_data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'liveboard_dismissed' }
    )
  end

  def activate_question(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    question = find_question_in_presentation(presentation, data['question_id'])
    return unless question

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'question_activated', question_id: question[:id], question: serialize_question(question) }
    )

    active_session = active_session_for_presentation(presentation)
    broadcast_question_results(presentation, active_session, question) if active_session
  end

  def submit_question_response(data)
    presentation = Presentation.find(params[:presentation_id])
    active_session = active_session_for_presentation(presentation)
    return unless active_session

    question = find_question_in_presentation(presentation, data['question_id'])
    return unless question

    answer = data['answer'].to_s.strip
    return if answer.blank?

    if question[:type] == 'single_choice'
      valid = (question[:options] || []).map { |o| o[:text] }.include?(answer)
      return unless valid
    end

    store = question_store_for_session(active_session.id, question[:id])
    user_key = current_user.id.to_s
    return if store['user_answers'].key?(user_key)

    store['user_answers'][user_key] = answer
    store['results'][answer] = store['results'].fetch(answer, 0) + 1
    store['total'] = store['total'].to_i + 1

    if question[:type] == 'open_text'
      store['recent_answers'] ||= []
      store['recent_answers'] << answer
      store['recent_answers'] = store['recent_answers'].last(20)
    end
  
    Rails.cache.write(question_store_key(active_session.id, question[:id]), store, expires_in: 12.hours)
    broadcast_question_results(presentation, active_session, question)
  end

  def question_store_key(session_id, question_id)
    "presentation_session:#{params[:presentation_id]}:session:#{session_id}:question:#{question_id}"
  end

  def question_store_for_session(session_id, question_id)
    Rails.cache.fetch(question_store_key(session_id, question_id)) do
      { 'results' => {}, 'total' => 0, 'user_answers' => {}, 'recent_answers' => [] }
    end
  end

  def find_question_in_presentation(presentation, question_id)
    target_id = question_id.to_s
    presentation.slides.each do |slide|
      payload = slide.background.is_a?(Hash) ? slide.background : {}
      questions = payload['questions'] || payload[:questions] || []
      questions.each do |q|
        qh = q.is_a?(Hash) ? q : {}
        next unless (qh['id'] || qh[:id]).to_s == target_id

        options = (qh['options'] || qh[:options] || []).map do |opt|
          oh = opt.is_a?(Hash) ? opt : {}
          { id: (oh['id'] || oh[:id]).to_s, text: (oh['text'] || oh[:text]).to_s }
        end

        return {
          id: (qh['id'] || qh[:id]).to_s,
          prompt: (qh['prompt'] || qh[:prompt]).to_s,
          type: ((qh['type'] || qh[:type]).to_s == 'single_choice' ? 'single_choice' : 'open_text'),
          options: options
        }
      end
    end
    nil
  end

  def serialize_question(question)
    {
      id: question[:id],
      prompt: question[:prompt],
      type: question[:type],
      options: question[:options]
    }
  end

  def broadcast_question_results(presentation, active_session, question)
    store = question_store_for_session(active_session.id, question[:id])
    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'question_results',
        question_id: question[:id],
        question_type: question[:type],
        results: store['results'] || {},
        total: store['total'] || 0,
        recent_answers: store['recent_answers'] || []
      }
    )
  end
  
  def activate_poll(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    poll = Poll.includes(:poll_options, :poll_responses, :slide).find(data['poll_id'])
    poll.slide.polls.update_all(is_active: false)
    poll.update!(is_active: true)

    PresentationChannel.broadcast_to(
      presentation,
      {
        type: 'poll_activated',
        poll_id: poll.id,
        poll: serialize_poll(poll, active_session_for_presentation(presentation))
      }
    )

    broadcast_poll_results(poll, active_session_for_presentation(presentation))
  end

  def submit_poll_response(data)
    poll = Poll.includes(slide: :presentation).find(data['poll_id'])
    presentation = poll.slide&.presentation
    return unless presentation

    active_session = active_session_for_presentation(presentation)
    return unless active_session

    option = poll.poll_options.find_by(text: data['answer'])
    return unless option

    existing = PollResponse.find_by(
      poll_id: poll.id,
      user_id: current_user.id,
      presentation_session_id: active_session.id
    )
    return if existing

    PollResponse.create!(
      poll_id: poll.id,
      user_id: current_user.id,
      presentation_session_id: active_session.id,
      answer: option.text
    )

    broadcast_poll_results(poll, active_session)
  end

  private

  def active_session_for_presentation(presentation)
    presentation.presentation_sessions.find_by(ended_at: nil)
  end

  def broadcast_poll_results(poll, active_session)
    return unless active_session

    scoped = poll.poll_responses.where(presentation_session_id: active_session.id)
    results = scoped.group(:answer).count
    total = scoped.count

    PresentationChannel.broadcast_to(
      poll.slide.presentation,
      {
        type: 'poll_results',
        poll_id: poll.id,
        results: results,
        total: total
      }
    )
  end

  def serialize_poll(poll, active_session)
    counts = if active_session
               poll.poll_responses.where(presentation_session_id: active_session.id).group(:answer).count
             else
               {}
             end

    {
      id: poll.id,
      question: poll.question,
      options: poll.poll_options.map do |option|
        {
          id: option.id,
          text: option.text,
          votes: counts[option.text].to_i
        }
      end
    }
  end
end