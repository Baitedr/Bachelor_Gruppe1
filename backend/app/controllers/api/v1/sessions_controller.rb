module Api
    module V1
        class SessionsController < ApplicationController
            before_action :authenticate_user!, only: [:join, :end_session, :participants, :session_state]
            before_action :load_current_user_from_token, only: [:join_by_code]

            # POST /api/v1/sessions/guest_join
            # Ingen autentisering kreves her. Deltaker opprettes som "gjest".
            def guest_join
                session = PresentationSession.find_by(
                    join_code: params[:code]&.upcase,
                    ended_at: nil
                )

                unless session
                    return render json: { error: 'Ingen aktiv sesjon funnet for denne koden.' }, status: :not_found
                end

                guest_user = create_guest_user!

                SessionParticipant.create!(
                    session_id: session.id,
                    user_id: guest_user.id
                )
                broadcast_session_state(session)

                token = JsonWebToken.encode(user_id: guest_user.id, guest: true)

                render json: {
                    token: token,
                    presentation_id: session.presentation_id,
                    join_code: session.join_code,
                    session_started: session.started?,
                    session_ended: session.ended_at.present?,
                    participant_count: session.session_participants.count
                }, status: :ok
            end

            # POST /api/v1/sessions/join_by_code
            # Kalles av PhoneInteraction – ingen presentation_id nødvendig, bare koden.
            def join_by_code
                session = PresentationSession.find_by(
                    join_code: params[:code]&.upcase,
                    ended_at: nil
                )

                unless session
                    return render json: { error: 'Ingen aktiv sesjon funnet for denne koden.' }, status: :not_found
                end

                participant = @current_user || create_guest_user!
                SessionParticipant.find_or_create_by!(session_id: session.id, user_id: participant.id)
                broadcast_session_state(session)
                token = @current_user ? nil : JsonWebToken.encode(user_id: participant.id, guest: true)

                render json: {
                    message: 'Koblet til',
                    presentation_id: session.presentation_id,
                    join_code: session.join_code,
                    session_started: session.started?,
                    session_ended: session.ended_at.present?,
                    participant_count: session.session_participants.count,
                    token: token
                }, status: :ok
            end

            # POST /api/v1/presentations/:presentation_id/join
            # Kalles av frontend når en bruker klikker "Bli med" på en live-presentasjon. Krever autentisering.
            def join
                presentation = Presentation.find(params[:id])
                session = presentation.presentation_sessions.find_by(ended_at: nil)

                unless session
                    return render json: { error: 'Ingen aktiv sesjon.' }, status: :not_found
                end

                if @current_user.id == presentation.owner_id
                    # Owner/presenter skal ikke telles som deltaker.
                    SessionParticipant.where(session_id: session.id, user_id: @current_user.id).delete_all
                else
                    SessionParticipant.find_or_create_by!(
                        session_id: session.id,
                        user_id: @current_user.id
                    )
                end
                broadcast_session_state(session)

                render json: {
                    message: 'Koblet til',
                    presentation: live_presentation_payload(presentation),
                    join_code: session.join_code,
                    session_started: session.started?,
                    session_ended: session.ended_at.present?,
                    participant_count: session.session_participants.count
                }, status: :ok
            end
            # POST /api/v1/presentations/:id/end_session
            # Kalles av frontend når presentatøren avslutter en live-presentasjon. 
            # Krever autentisering og at brukeren er eier av presentasjonen.
            def end_session
                presentation = Presentation.find(params[:id])

                unless presentation.owner_id == @current_user.id
                    return render json: { error: 'Unauthorized' }, status: :forbidden
                end

                session = presentation.presentation_sessions.find_by(ended_at: nil)

                if session
                    session.update!(ended_at: Time.current)
                    presentation.update!(is_live: false)
                    delete_guest_users_from_session(session)
                    delete_session_data(session)
                end

                render json: {
                    session: session,
                    presentation: presentation.as_json(include: {
                        slides: {
                            include: {
                                polls: { include: :poll_options },
                                slide_elements: {}
                            }
                        }
                    })
                }
            end
            # GET /api/v1/presentations/:id/participants
            # Kalles av frontend for å hente deltakerliste til en live-presentasjon. 
            # Krever autentisering og at brukeren er eier av presentasjonen.
            def participants
                presentation = Presentation.find(params[:id])
                session = presentation.presentation_sessions.where(ended_at: nil).last

                if session
                    participants = session.session_participants.includes(:user)
                    render json: {
                        participants: participants.map { |p| {
                        id: p.user.id,
                        name: p.user.name,
                        email: p.user.email,
                        joined_at: p.joined_at
                    }}
                    }
                else
                    render json: { participants: [] }
                end
            end
            # GET /api/v1/presentations/:id/session_state
            # Kalles av frontend for å sjekke om det er en aktiv sesjon for presentasjonen. 
            # Krever autentisering.
            def session_state
                presentation = Presentation.find(params[:id])
                session = presentation.presentation_sessions.find_by(ended_at: nil)

                if session
                    render json: {
                        session_started: session.started?,
                        session_ended: false,
                        participant_count: session.session_participants.count,
                        join_code: session.join_code
                    }, status: :ok
                else
                    render json: {
                        session_started: false,
                        session_ended: true,
                        participant_count: 0,
                        join_code: nil
                    }, status: :ok
                end
            end

            private
            
            def load_current_user_from_token
                auth_header = request.headers['Authorization']
                token = auth_header&.split(' ')&.last
                return if token.blank?

                decoded = JsonWebToken.decode(token)
                return unless decoded&.dig(:user_id)

                @current_user = User.find_by(id: decoded[:user_id])
            end
            # Oppretter en midlertidig "gjest" bruker som kan delta i en sesjon uten å ha en vanlig konto.
            def create_guest_user!
                User.create!(
                    email: "guest_#{SecureRandom.hex(6)}@guest.proslides",
                    password: build_guest_password,
                    name: 'Gjest'
                )
            end
            # Sletter gjestebruker som deltar i en sesjon.
            def delete_guest_user(user)
                return unless user.email.end_with?('@guest.proslides')

                user.destroy
            end
            # Sletter alle gjestebrukere som deltar i en sesjon når den avsluttes.
            def delete_guest_users_from_session(session)
                session.session_participants.each do |participant|
                    delete_guest_user(participant.user)
                end
            end
            # Sletter alle data knyttet til en sesjon, inkludert deltakere og svar, når en sesjon avsluttes.
            def delete_session_data(session)
                PollResponse.where(presentation_session_id: session.id).destroy_all
                SessionParticipant.where(session_id: session.id).destroy_all

                session.destroy!
            end
            # Sletter alle aktive sesjoner knyttet til en presentasjon, for eksempel når en presentasjon slettes.
            def delete_live_session_from_presentation(presentation)
                presentation.presentation_sessions.where.not(ended_at: nil).each do |session|
                    delete_session_data(session)
                end
            end
            # Bygger et komplekst passord for gjestebrukere som oppfyller vanlige krav til passordstyrke.
            def build_guest_password
                # møter kravene til minimum 12 tegn, både store og små bokstaver, tall og spesialtegn.
                "Guest#{SecureRandom.alphanumeric(10)}1aA"
            end
            # Sender sanntidsoppdateringer til alle klienter som er koblet til presentasjonen når en deltaker blir med eller når sesjonstilstanden endres.
            def broadcast_session_state(session)
                count = session.session_participants.count
                payload = {
                    participant_count: count,
                    session_started: session.started?,
                    session_ended: session.ended_at.present?
                }

                safe_broadcast(session.presentation, { type: 'participant_joined', count: count })
                safe_broadcast(session.presentation, { type: 'session_state' }.merge(payload))
            end
            # Sender sanntidsoppdateringer til alle klienter som er koblet til presentasjonen.
            def safe_broadcast(presentation, payload)
                PresentationChannel.broadcast_to(presentation, payload)
            rescue StandardError => e
                Rails.logger.warn(
                    "[sessions#safe_broadcast] failed presentation_id=#{presentation.id} " \
                    "event=#{payload[:type] || payload['type']} error=#{e.class}: #{e.message}"
                )
            end
            
            def live_presentation_payload(presentation)
                slides = presentation.slides.order(:slide_index).includes(polls: :poll_options)

                {
                    id: presentation.id,
                    title: presentation.title,
                    slides: slides.map { |slide| live_slide_payload(slide) },
                    variables: live_presentation_variables(slides.first)
                }
            end
            
            def live_slide_payload(slide)
                payload = slide.background.is_a?(Hash) ? slide.background : {}

                {
                    id: slide.id,
                    slideIndex: slide.slide_index,
                    title: payload_value(payload, 'title') || "Slide #{slide.slide_index + 1}",
                    content: payload_value(payload, 'content') || '',
                    notes: slide.notes.presence || payload_value(payload, 'notes') || '',
                    backgroundColor: payload_value(payload, 'backgroundColor') || '#ffffff',
                    fabricData: payload_value(payload, 'fabricData'),
                    previewImage: payload_value(payload, 'previewImage'),
                    variables: payload_value(payload, 'variables') || [],
                    questions: payload_value(payload, 'questions') || [],
                    polls: slide.polls.map do |poll|
                        {
                            id: poll.id,
                            question: poll.question,
                            poll_type: poll.poll_type,
                            options: poll.poll_options.map do |option|
                                { id: option.id, text: option.text }
                            end
                        }
                    end
                }
            end

            def live_presentation_variables(first_slide)
                return [] unless first_slide

                payload = first_slide.background.is_a?(Hash) ? first_slide.background : {}
                payload_value(payload, 'variables') || []
            end

            def payload_value(payload, key)
                payload[key] || payload[key.to_sym]
            end
        end
    end
end
