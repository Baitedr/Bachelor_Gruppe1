module Api
    module V1
        class SessionsController < ApplicationController
            before_action :authenticate_user!

            def start
                presentation = Presentation.find(params[:presentation_id])

                unless presentation.owner_id == @current_user.id
                    return render json: { error: 'Unauthorized' }, status: :forbidden
                end

                session = PresentationSession.create!(
                    presentation: presentation,
                    started_at: Time.current
                )

                presentation.update!(is_live: true)

                render json: {
                    session: session,
                    presentation: presentation
                }, status: :created
            end

            def end_session
                presentation = Presentation.find(params[:presentation_id])

                unless presentation.owner_id == @current_user.id
                    return render json: { error: 'Unauthorized' }, status: :forbidden
                end

                session = presentation.presentation_sessions.where(ended_at: nil).last

                SessionParticipant.find_or_create_by!(
                    session_id: session.id,
                    user_id: @current_user.id
                )

                render json: {
                    session: session,
                    presentation: presentation.as_json(include: {
                        slides: {
                            include: {
                                polls: {include: :poll_options},
                                slide_elements: {}
                            }
                        }
                    })
                }
            end

            def participants
                presentation = Presentation.find(params[:presentation_id])
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
        end
    end
end
