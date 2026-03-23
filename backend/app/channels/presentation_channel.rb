class PresentationChannel < ApplicationCable::Channel
  def subscribed
    presentation = Presentation.find_by(id: params[:presentation_id])
    return reject unless presentation

    stream_for presentation

    active_session = presentation.presentation_sessions.find_by(ended_at: nil)
    return unless active_session && presentation.is_live

    if current_user.id == presentation.owner_id
      count = active_session.session_participants.count
      transmit({ type: 'participant_joined', count: count })
    else
      SessionParticipant.find_or_create_by(
        session_id: active_session.id,
        user_id: current_user.id
      )
      count = active_session.session_participants.count
      PresentationChannel.broadcast_to(
        presentation,
        { type: 'participant_joined', count: count }
      )
    end
  end

  def unsubscribed
  end

  def start_session(_data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'session_started' }
    )
  end

  def navigate_slide(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'slide_change', slide_index: data['slide_index'] }
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
      { type: 'poll_activated', poll_id: poll.id, poll: serialize_poll(poll) }
    )

    broadcast_poll_results(poll)
  end

  def submit_poll_response(data)
    poll = Poll.includes(slide: :presentation).find(data['poll_id'])
    presentation = poll.slide&.presentation
    return unless presentation

    active_session = presentation.presentation_sessions.find_by(ended_at: nil)
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

    broadcast_poll_results(poll)
  end

  private

  def broadcast_poll_results(poll)
    results = poll.poll_responses.group(:answer).count
    total = poll.poll_responses.count

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

  def serialize_poll(poll)
    counts = poll.poll_responses.group(:answer).count

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