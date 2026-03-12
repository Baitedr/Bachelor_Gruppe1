module ApplicationCable
    class Channel < ActionCable::Channel::Base
    end
end

class PresentationChannel < ApplicationCable::Channel
  def subscribed
    presentation = Presentation.find_by(id: params[:presentation_id])
    return reject unless presentation

    stream_for presentation

    active_session = active_session_for_presentation(presentation)
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
    presentation = owned_presentation
    return unless presentation

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'session_started' }
    )
  end

  def navigate_slide(data)
    presentation = owned_presentation
    return unless presentation

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'slide_change', slide_index: data['slide_index'] }
    )
  end

  def activate_poll(data)
    presentation = owned_presentation
    return unless presentation

    poll = Poll.includes(:poll_options, :poll_responses, :slide).find(data['poll_id'])
    poll.slide.polls.update_all(is_active: false)
    poll.update!(is_active: true)

    session = active_session_for_presentation(presentation)

    PresentationChannel.broadcast_to(
      presentation,
      { type: 'poll_activated', poll_id: poll.id, poll: serialize_poll(poll, session) }
    )
  end

  def submit_poll_response(data)
    poll = Poll.includes(slide: :presentation).find(data['poll_id'])
    presentation = poll.slide.presentation
    session = active_session_for_presentation(presentation)
    return unless session

    existing = PollResponse.find_by(
      poll_id: poll.id,
      user_id: current_user.id,
      presentation_session_id: session.id
    )
    return if existing

    PollResponse.create!(
      poll_id: poll.id,
      user_id: current_user.id,
      answer: data['answer'],
      presentation_session_id: session.id
    )

    broadcast_poll_results(poll, session)
  end

  private

  def owned_presentation
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    presentation
  end

  def active_session_for_presentation(presentation)
    presentation.presentation_sessions.find_by(ended_at: nil)
  end

  def scoped_poll_responses(poll, session)
    return poll.poll_responses.none unless session

    poll.poll_responses.where(presentation_session_id: session.id)
  end

  def broadcast_poll_results(poll, session)
    responses = scoped_poll_responses(poll, session)
    results = responses.group(:answer).count
    total = responses.count

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

  def serialize_poll(poll, session)
    counts = scoped_poll_responses(poll, session).group(:answer).count

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
