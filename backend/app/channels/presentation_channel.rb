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

def start_session(data)
  presentation = Presentation.find(params[:presentation_id])
  return unless presentation.owner_id == current_user.id

  PresentationChannel.broadcast_to(
    presentation,
    { type: 'session_started' }
  )
end

# Navigerer til en spesifikk slide
def navigate_slide(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    PresentationChannel.broadcast_to(
        presentation,
         { type: 'slide_change', slide_index: data['slide_index'] }
    )
end

# Aktiverer en poll og deaktivere andre polls på samme slide
def activate_poll(data)
    presentation = Presentation.find(params[:presentation_id])
    return unless presentation.owner_id == current_user.id

    poll = Poll.find(data['poll_id'])
    poll.slide.polls.update_all(is_active: false)
    poll.update!(is_active: true)

    PresentationChannel.broadcast_to(
        presentation,
        { type: 'poll_activated', poll_id: poll.id, poll: poll.as_json(include: :poll_options) }
    )
end

def submit_poll_response(data)
    poll = Poll.find(data['poll_id'])

    # sjekker om bruker allerede har svart
    existing = PollResponse.find_by(poll_id: poll.id, user_id: current_user.id)
    return if existing

    PollResponse.create!(
        poll_id: poll.id,
        user_id: current_user.id,
        answer: data['answer']
    )

    broadcast_poll_results(poll)
end

private 

# Beregner og sender poll resultater til alle klienter som er koblet til presentasjonen
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
end